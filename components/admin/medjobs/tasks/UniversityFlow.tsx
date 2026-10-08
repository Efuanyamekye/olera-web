"use client";

import { useEffect, useRef, useState } from "react";
import { DrawerShell } from "@/components/admin/medjobs/DrawerShell";
import { useSaveState } from "@/components/admin/medjobs/SaveStatus";
import { LADDERS, SECTION_ORDER, rungAt, type ContactField, type SectionKey } from "@/lib/medjobs/ladders";
import { sectionsFor, type Person } from "@/lib/medjobs/assignments";
import {
  actionAt,
  canReopen,
  complete,
  SWEEP_PREFIX,
  defer,
  doAgain,
  doneToday,
  isCheck,
  nextReady,
  readyCountIn,
  reopen,
  revive,
  type BoardRecord,
  type BoardTask,
  type BoardUniversity,
  type Effect,
} from "@/lib/medjobs/task-board";
import { isDemoUniversity } from "@/lib/medjobs/demo-university";
import NewRecordView, { type NewRecord } from "./NewRecordView";
import RecordView from "./RecordView";
import SummaryView from "./SummaryView";
import TaskView from "./TaskView";

/**
 * A university, opened.
 *
 * It opens on the summary — the seven sections and what each is waiting on
 * — because an operator should be able to see the shape of a campus before
 * working it. Start the next task and it runs them in a row, each one
 * handing over the next without a list in between. The university name in
 * the header always comes back here.
 */

/**
 * Sections whose task screens reach the database, and the ops that take them
 * there.
 *
 * All three that have one, now. Providers were the last gap and the reason
 * it closed is the opening block: three rungs waiting at once is only worth
 * anything if finishing the first two survives a refresh.
 */
/**
 * Which server ops a section's writes go through.
 *
 * Written as a default plus its exceptions, not as a list of the sections
 * that work. It was a list, and advisors, student orgs and professors were
 * not on it — so every task logged on one of those records updated the
 * screen, said "Saved", and reached nothing. The note and the outcome lived
 * in this page object until the next reload threw them away. Attachments
 * survived, because those post on their own path, which is what made the
 * loss look arbitrary.
 *
 * A section left out of a list is silent. A section left out of an override
 * gets the record ops, which is right for every section whose records are
 * student_outreach rows — providers, advisors, orgs, events and professors,
 * and anything added beside them.
 */
const RECORD_OPS = {
  complete: "complete_record_task",
  reopen: "reopen_check",
  defer: "defer_record_task",
} as const;

const PERSISTED: Record<SectionKey, { complete: string; reopen: string; defer: string }> =
  Object.fromEntries(
    SECTION_ORDER.map((key) => [
      key,
      // A job board is a channel, not a record, and a student is their own
      // profile. Those two have their own tables and so their own ops.
      key === "jobboard"
        ? { complete: "complete_channel_task", reopen: "reopen_check", defer: "defer_channel_task" }
        : key === "students"
          ? {
              complete: "complete_student_task",
              reopen: "reopen_student_task",
              defer: "defer_student_task",
            }
          : RECORD_OPS,
    ]),
  ) as Record<SectionKey, { complete: string; reopen: string; defer: string }>;

type View =
  | { kind: "summary" }
  | { kind: "task"; recordId: string; taskId: string }
  | { kind: "record"; recordId: string }
  | { kind: "new"; section: SectionKey };

export default function UniversityFlow({
  university,
  onClose,
  onChanged,
  onReload,
  people,
  filterId,
}: {
  university: BoardUniversity;
  onClose: () => void;
  /** The MedJobs team, for the assignee chips. */
  people: Person[];
  /** Whose work to foreground inside this university, or null for everyone's. */
  filterId: string | null;
  /**
   * An in-memory change. The board behind only needs to recount, and must
   * NOT refetch: task progress is not persisted yet, so a reload here would
   * throw away what the operator just did.
   */
  onChanged: () => void;
  /**
   * Something reached the database. Refetch, because a write changes more
   * than the field that was edited — an archived record leaves the board
   * entirely — and patching that in memory is how a screen starts lying
   * about what is saved.
   */
  onReload: () => void | Promise<void>;
}) {
  // The task types in front of this operator. Everything when unfiltered.
  // The header count, the progress bar and "Start the next task" all read
  // from it, so a filtered drawer never hands over somebody else's record.
  // Computed before the effects because the resume effect below needs it.
  const mine = sectionsFor(university.assignments, filterId);

  const [view, setView] = useState<View>({ kind: "summary" });
  /**
   * True while the operator is working tasks in a row rather than browsing.
   *
   * It is the difference between finishing a rung and being handed the next
   * one, and opening a record on purpose and being left on it. Both are
   * right; which one it is depends on how you got here, and nothing else on
   * the screen can tell.
   */
  const [running, setRunning] = useState(false);
  /**
   * Which sections the summary has open, and the record last looked at.
   *
   * Held here rather than in the summary, which unmounts on every record.
   * Coming back to a collapsed list sixty times is the difference between
   * screening a campus and fighting the screen.
   */
  const [openSections, setOpenSections] = useState<Partial<Record<SectionKey, boolean>>>({});
  const [cameFrom, setCameFrom] = useState<string | null>(null);
  const [, force] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cheer, setCheer] = useState<string | null>(null);
  /**
   * A write the server refused, held until it is dealt with.
   *
   * Not a toast. A toast for this is how somebody works twenty providers
   * believing every one of them saved.
   */
  const [failed, setFailed] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  /** Set when a write that refetches should hand over the next task after. */
  const resume = useRef(false);

  /**
   * What the drawer header says about the last write.
   *
   * Driven from send(), which is the only function in here that writes, so
   * the line cannot fall out of step with what actually reached the server.
   */
  const { state: saveState, saving: beginSave } = useSaveState();

  useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
    },
    [],
  );

  const redraw = () => {
    force((n) => n + 1);
    onChanged();
  };

  const say = (msg: string) => {
    setToast(msg);
    timers.current.push(window.setTimeout(() => setToast(null), 2200));
  };

  /**
   * Everything that has to reach the database goes through here. The board
   * is reloaded from the server afterwards rather than patched in memory,
   * because a delete changes more than the record it names and guessing at
   * the rest is how a screen starts lying about what is saved.
   *
   * It is also the whole of the teaching campus's sandbox. Because this is
   * the only function that writes, one guard here is the guarantee — not a
   * rule each caller has to remember. The screen has already applied the
   * change by the time send() is reached, so returning success is the real
   * behaviour rather than a pretence, and a refresh discards it because
   * there was never a row.
   */
  const send = async (
    payload: Record<string, unknown>,
    done: string,
    opts?: {
      /**
       * Skip the refetch. Only for a write the screen has already applied
       * identically: reloading would be correct for this record and would
       * throw away every un-persisted task on all the others, which is the
       * whole board's worth of a run-through.
       */
      keepBoard?: boolean;
      /** Put back what the optimistic change did, when the write failed. */
      undo?: () => void;
    },
  ): Promise<{ ok: boolean; data?: Record<string, unknown> }> => {
    if (isDemoUniversity(university)) {
      if (done) say(done);
      return { ok: true };
    }
    setBusy(true);
    // Claimed here rather than at each call site, so a write added later
    // reports itself without anybody having to remember to make it.
    const write = beginSave();
    try {
      const res = await fetch("/api/admin/medjobs/tasks-board/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { error?: string } & Record<string, unknown>;
      if (!res.ok) {
        // Sticky, because the screen has usually already moved on. The
        // board is reloaded too: the server is the truth, and leaving the
        // optimistic change on screen is what made a rejected write look
        // like a saved one.
        setFailed(
          res.status === 401
            ? "Your session has expired, so nothing is saving. Reload the page and sign in again — then redo the last step."
            : `Not saved: ${json.error ?? "the server refused it"}`,
        );
        opts?.undo?.();
        write.failed(
          res.status === 401 ? "Your session has expired." : json.error ?? "The server refused it.",
        );
        void onReload();
        return { ok: false };
      }
      setFailed(null);
      write.saved();
      if (done) say(done);
      if (!opts?.keepBoard) await onReload();
      return { ok: true, data: json };
    } catch {
      setFailed("Could not reach the server, so nothing was saved. Check your connection and redo the last step.");
      opts?.undo?.();
      write.failed("Could not reach the server.");
      return { ok: false };
    } finally {
      setBusy(false);
    }
  };

  const celebrate = (msg: string) => {
    setCheer(msg);
    timers.current.push(window.setTimeout(() => setCheer(null), 1700));
  };

  const records = Object.values(university.records).flat();
  const record = "recordId" in view ? records.find((r) => r.id === view.recordId) ?? null : null;
  const task =
    view.kind === "task" && record ? record.tasks.find((t) => t.id === view.taskId) ?? null : null;

  /**
   * Show a task on whichever screen it belongs to.
   *
   * A check rung is worked on the record, so it opens the record. Everything
   * else opens the task screen. Nothing left opens the summary.
   */
  /**
   * Clear the "new" tag the first time somebody opens an applicant.
   *
   * Fire and forget, and the tag is dropped locally whatever the request
   * does. The worst case is a tag that comes back on the next reload, which
   * is a great deal better than a drawer that refuses to open because a
   * bookkeeping call failed. It writes metadata.admin_viewed_at, the same
   * field the In Basket and the sidebar counts read, so opening a student
   * here clears them there too.
   */
  const markSeen = (r: BoardRecord) => {
    if (r.section !== "students" || !r.isNew) return;
    r.isNew = false;
    redraw();
    void fetch("/api/admin/medjobs/mark-entity-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "candidate", id: r.id, action: "read" }),
    }).catch(() => {
      /* it stays new until the next reload. Nothing is lost. */
    });
  };

  /** Remember where we were, so the summary can put us back. */
  const openRecord = (r: BoardRecord) => {
    markSeen(r);
    setOpenSections((o) => ({ ...o, [r.section]: true }));
    setCameFrom(r.id);
    // The map sweep has no record behind it — no contact, no address, no
    // history. Opening its record screen would show a form about nobody, so
    // its row goes straight to the one task it exists to hand over.
    if (r.id.startsWith(SWEEP_PREFIX) && r.tasks[0]) {
      setView({ kind: "task", recordId: r.id, taskId: r.tasks[0].id });
      return;
    }
    setView({ kind: "record", recordId: r.id });
  };

  const go = (next: { record: BoardRecord; task: BoardTask } | null) => {
    if (!next) {
      setView({ kind: "summary" });
      return;
    }
    // Working through the queue lands on records too, and an applicant you
    // have just done a task on is not new any more.
    markSeen(next.record);
    setOpenSections((o) => ({ ...o, [next.record.section]: true }));
    setCameFrom(next.record.id);
    setView(
      isCheck(next.task)
        ? { kind: "record", recordId: next.record.id }
        : { kind: "task", recordId: next.record.id, taskId: next.task.id },
    );
  };

  /**
   * A record that left the board should not end the run.
   *
   * Archiving and deleting refetch, because the record has to disappear and
   * guessing at what else moved is how a screen starts lying. The refetch
   * arrives as a new university object, so the run picks itself up here
   * rather than trying to hold a pointer across it.
   */
  useEffect(() => {
    if (!resume.current) return;
    resume.current = false;
    go(nextReady(university, null, mine));
    // Only when a new board arrives; go() and the rest are read fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [university]);

  /**
   * Where every change lands.
   *
   * A run-through goes wherever the board says next, including the next
   * provider — that is what "Start the next task" is for.
   *
   * Working one provider at a time is a different act. Within the record you
   * opened the hand-over still happens, because finishing the call and then
   * being handed the programme email is the point. But when that record has
   * nothing left, the drawer stops on the record itself rather than dropping
   * you into a stranger: the record is where you can see what it is waiting
   * on next and when, which is the question you actually have at that
   * moment. The university is one click up from there.
   */
  const land = (effect: Effect) => {
    if (!running && record && effect.landOn?.record.id !== record.id) {
      setView({ kind: "record", recordId: record.id });
      redraw();
      if (effect.universityCleared) celebrate(`${university.name} is clear for today`);
      else if (effect.recordCleared) say(`${record.name} — done for today`);
      return;
    }
    go(effect.landOn);
    redraw();
    if (effect.universityCleared) {
      celebrate(`${university.name} is clear for today`);
    } else if (effect.recordCleared && record) {
      say(`${record.name} — done for today`);
    }
  };

  /**
   * Tick or untick a rung that is worked on the record.
   *
   * The screen applies it and the server is told separately, rather than the
   * screen waiting for the server and then reloading. Reloading is right for
   * this record and wrong for the board: it would discard every task
   * completed in this sitting that has no home in the database yet. If the
   * write fails, the tick is put back and the toast says so.
   */
  const check = (task: BoardTask, done: boolean) => {
    if (!record || busy) return;
    const rung = rungAt(task.section, task.step, task.round);
    const action = rung?.actions[0];
    if (!action) return;

    if (!done) {
      if (!canReopen(record, task)) {
        say("Work has already moved on, so this can't be unticked");
        return;
      }
      reopen(record, task);
      redraw();
      void send(
        { op: "reopen_check", recordId: record.id, step: task.step, round: task.round },
        "",
        { keepBoard: true, undo: () => { complete(university, record, task, action); redraw(); } },
      );
      return;
    }

    const effect = complete(university, record, task, action);
    redraw();
    void send(
      { op: "complete_check", recordId: record.id, step: task.step, round: task.round },
      `${rung?.title ?? "Done"} — ${record.name}`,
      { keepBoard: true, undo: () => { reopen(record, task); redraw(); } },
    );
    // Browsing leaves you where you are; a run-through hands over the next
    // rung, which for a provider is the call on the same record.
    if (running) go(effect.landOn);
  };

  const act = (index: number) => {
    if (!record || !task) return;
    const rung = rungAt(task.section, task.step, task.round);
    if (!rung) return;
    const action = actionAt(rung, index);
    if (!action) return;

    // No `index >= 0` here. "They replied" is index -1, and that guard meant
    // the one outcome carrying a typed note was the one outcome that never
    // reached the database: it applied on screen and vanished on reload.
    const persist = PERSISTED[record.section];
    if (persist) {
      void send(
        {
          op: persist.complete,
          recordId: record.id,
          step: task.step,
          round: task.round,
          actionIndex: index,
          note: task.note,
          // What the outcome asked for. Without it a booked meeting kept
          // its time only until the page reloaded, and the checkbox that
          // opens the meeting branch never reached the server at all.
          fields: task.fields ?? {},
          // The list as the page has it, ids and all. Every entry is already
          // a record; sending it lets the server catch an edit made in the
          // moment before the button was pressed.
          found: task.found ?? [],
        },
        // Say so. Finishing a task was the one write that confirmed
        // nothing, which is a strange thing for the action somebody
        // performs sixty times in a sitting and has to trust every time.
        "Saved",
        // A fan-out refetches. Its records exist already — each was created
        // when it was added — but finishing the sweep takes the sweep's own
        // row off the board, and that is the server's to decide.
        { keepBoard: action.outcome !== "fanout" },
      ).then(({ ok, data }) => {
        if (!ok || !data?.live) return;
        // The server has just told us the channel activated. The dot reads
        // from the channel, not the record, so it is patched here rather
        // than waiting for whenever the board is next refetched.
        const channel = LADDERS.jobboard.channel;
        if (channel) university.channels[channel] = "live";
        redraw();
        say(`Job board is live at ${university.name}`);
      });
    }

    land(complete(university, record, task, action));
  };

  // The record before and after this one, in the order the list shows them.
  // Screening a campus is a sweep, not a queue, so it follows the list
  // rather than what happens to be due.
  const siblings = record ? university.records[record.section] ?? [] : [];
  const at = record ? siblings.findIndex((r) => r.id === record.id) : -1;
  const step = (by: number) => {
    const next = siblings[at + by];
    if (next) openRecord(next);
  };

  /**
   * The record fields both screens write to.
   *
   * Lifted out of the record view because the confirming call now shows the
   * same block — that rung exists to put these right, and it could only
   * offer two of them.
   */
  const setWebsite = (v: string) => {
    if (!record) return;
    record.website = v;
    record.websiteEdited = true;
    force((n) => n + 1);
  };
  const setAddress = (v: string) => {
    if (!record) return;
    record.address = v;
    record.addressEdited = true;
    force((n) => n + 1);
  };
  const setField = (f: ContactField, v: string) => {
    if (!record) return;
    record[f] = v;
    force((n) => n + 1);
  };
  /**
   * Write the contact fields on the open record.
   *
   * Every field on the record screen calls this on blur. Both branches keep
   * the board rather than reloading it, and that is the whole of the fix for
   * the bug people described as "my typing disappears".
   *
   * What was happening: the non-job-board branch reloaded the entire board
   * from the server after every field save. The edit itself is applied by
   * mutating the record in place, so the reload changed nothing that was
   * already on screen — but it replaced the object being typed into. Tab out
   * of one field, start typing the next, and the reload landing mid-word
   * threw the new keystrokes away. Two or three attempts and one would stick,
   * because by then the reload had finished. It cost real work and it read as
   * the screen being haunted.
   *
   * There is nothing for a reload to tell us here. A contact field changes
   * that record and nothing else: no task moves, no count changes, no other
   * record is touched. The job board branch has always known this. The other
   * five sections now do too.
   */
  const saveFields = () => {
    if (!record) return;
    if (record.section === "jobboard") {
      void send(
        {
          op: "save_channel",
          recordId: record.id,
          fields: {
            boardUrl: record.boardUrl,
            postingUrl: record.postingUrl,
            contact: record.contact,
            email: record.email,
            servicesEmail: record.servicesEmail,
          },
        },
        "Saved",
        { keepBoard: true },
      );
      return;
    }
    void send(
      {
        op: "save_fields",
        recordId: record.id,
        fields: {
          contact: record.contact,
          role: record.role,
          phone: record.phone,
          email: record.email,
        },
        // Only sent when an admin has typed one. Otherwise the directory
        // stays the source and nothing is overridden with a copy of what it
        // already says.
        website: record.websiteEdited ? record.website : undefined,
        name: record.name,
        address: record.addressEdited ? record.address : undefined,
        others: record.others,
      },
      "Saved",
      { keepBoard: true },
    );
  };
  const campusFor = university.mapsDestination
    ? { name: university.name, destination: university.mapsDestination }
    : null;

  const left = readyCountIn(university, mine);
  const done = doneToday(university);
  const pct = Math.round((done / Math.max(1, done + left)) * 100);

  return (
    <DrawerShell
      onClose={onClose}
      save={saveState}
      header={
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => setView({ kind: "summary" })}
            className="text-left text-[13px] font-semibold text-gray-900 hover:underline"
          >
            {view.kind === "summary" ? university.name : `← ${university.name}`}
          </button>
          <p className="mt-0.5 text-[12px] text-gray-500">
            {left ? `${left} task${left > 1 ? "s" : ""} waiting` : "Nothing left today"}
            {done ? ` · ${done} done` : ""}
          </p>
        </div>
      }
    >
      <div className="h-0.5 w-full bg-gray-100">
        <div className="h-full bg-primary-600 transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>

      {view.kind === "task" && record && task ? (
        <TaskView
          universityName={university.name}
          universitySlug={university.slug}
          record={record}
          task={task}
          onOpenRecord={() => setView({ kind: "record", recordId: record.id })}
          permission={university.facultyPermission ?? null}
          onAct={act}
          onDefer={(days) => {
            const persist = PERSISTED[record.section];
            if (persist) {
              void send(
                {
                  op: persist.defer,
                  recordId: record.id,
                  step: task.step,
                  round: task.round,
                  days,
                },
                "",
                { keepBoard: true },
              );
            }
            land(defer(university, record, task, days));
          }}
          onStop={(reason) => {
            const rung = rungAt(task.section, task.step, task.round);
            const action = rung?.actions[0];
            if (!action) return;
            land(complete(university, record, task, { ...action, outcome: "archive" }, reason));
          }}
          onNote={(text) => {
            task.note = text;
            force((n) => n + 1);
          }}
          onField={(f, v) => {
            record[f] = v;
            force((n) => n + 1);
          }}
          saving={busy}
          onFound={(next) => {
            task.found = next;
            force((n) => n + 1);
            // Each addition becomes a record on the spot, so the board is
            // refetched rather than kept: the office somebody just added has
            // to appear in the list above the sweep, or the only evidence
            // the work landed is a row on the sweep's own screen — which is
            // exactly what made a morning of research look lost.
            //
            // The refetch is safe here in a way it is not elsewhere on this
            // screen. A sweep's id is derived from the campus and its task's
            // from that, so the drawer reopens on the same screen, and the
            // list it comes back with is the server's rather than ours.
            void send(
              { op: "save_sweep_found", recordId: record.id, found: next, note: task.note },
              "",
            );
          }}
          onFieldValue={(key, value) => {
            task.fields = { ...(task.fields ?? {}), [key]: value };
            force((n) => n + 1);
          }}
          onWebsite={setWebsite}
          onAddress={setAddress}
          onSaveFields={saveFields}
          campus={campusFor}
          onReopen={() => {
            // Undo has to reach the database wherever the doing did, or the
            // next refetch quietly puts the rung back.
            const persist = PERSISTED[record.section];
            if (persist) {
              void send(
                {
                  op: persist.reopen,
                  recordId: record.id,
                  step: task.step,
                  round: task.round,
                },
                "",
                { keepBoard: true },
              ).then(({ ok }) => {
                if (!ok) return;
                // Taking back the criterion can take the channel out of live.
                // Only the job board has criteria; a student undoing a
                // meeting must not demote it.
                const channel =
                  record.section === "jobboard" ? LADDERS.jobboard.channel : null;
                if (channel && university.channels[channel] === "live") {
                  university.channels[channel] = "in_progress";
                  redraw();
                }
              });
            }
            reopen(record, task);
            redraw();
          }}
          onAgain={() => {
            const copy = doAgain(record, task);
            setView({ kind: "task", recordId: record.id, taskId: copy.id });
            redraw();
          }}
        />
      ) : view.kind === "record" && record ? (
        <RecordView
          record={record}
          busy={busy}
          onField={setField}
          onWebsite={setWebsite}
          onRename={(v) => {
            record.name = v;
            force((n) => n + 1);
          }}
          onAddress={setAddress}
          onChannelField={(f, v) => {
            record[f] = v;
            force((n) => n + 1);
          }}
          onOthers={(next) => {
            record.others = next;
            force((n) => n + 1);
          }}
          onSaveFields={saveFields}
          onClearFlag={() => {
            record.flaggedOn = null;
            force((n) => n + 1);
            void send({ op: "clear_flag", recordId: record.id }, "Flag cleared", {
              keepBoard: true,
              undo: () => {
                record.flaggedOn = new Date().toISOString();
                redraw();
              },
            });
          }}
          onOpenTask={(t: BoardTask) => setView({ kind: "task", recordId: record.id, taskId: t.id })}
          onCheck={check}
          position={at >= 0 ? { at: at + 1, of: siblings.length } : null}
          onPrev={at > 0 ? () => step(-1) : null}
          onNext={at >= 0 && at < siblings.length - 1 ? () => step(1) : null}
          campus={campusFor}
          onRevive={() => {
            const t = revive(record);
            setView({ kind: "task", recordId: record.id, taskId: t.id });
            redraw();
          }}
          onArchive={() => {
            void send({ op: "archive_record", recordId: record.id }, `${record.name} archived`)
              .then(({ ok }) => {
                if (!ok) return;
                // A run-through should not stop because a record left it.
                if (running) resume.current = true;
                else setView({ kind: "summary" });
              });
          }}
          onRevertStatus={() => {
            void send(
              { op: "revert_status", recordId: record.id },
              `Status cleared for ${record.name}`,
              { keepBoard: true },
            ).then(({ ok }) => {
              if (!ok) return;
              // Clear the local state too so the UI updates immediately.
              record.state = null;
              record.step = 0;
              record.round = 0;
              redraw();
            });
          }}
          onDelete={() => {
            // Destroying a record takes its call history with it, so the
            // name has to be in front of the person clicking.
            const sure = window.confirm(
              `Delete ${record.name}?\n\nThis removes the record and everything logged against it, including any calls migrated from the spreadsheet. It cannot be undone.\n\nArchive instead if you only want it off the board.`,
            );
            if (!sure) return;
            void send({ op: "delete_record", recordId: record.id }, `${record.name} deleted`)
              .then(({ ok }) => {
                if (!ok) return;
                // A run-through should not stop because a record left it.
                if (running) resume.current = true;
                else setView({ kind: "summary" });
              });
          }}
        />
      ) : view.kind === "new" ? (
        <NewRecordView
          section={view.section}
          universityName={university.name}
          busy={busy}
          onCancel={() => setView({ kind: "summary" })}
          onCreate={(draft: NewRecord) => {
            void send(
              { op: "create_record", campusId: university.id, section: view.section, ...draft },
              `${draft.name.trim()} added`,
            ).then(({ ok, data }) => {
              // Open what was just created. The board has been refetched, so
              // the id is the real one and the record is the real record.
              if (ok && typeof data?.id === "string") {
                setView({ kind: "record", recordId: data.id });
              } else if (ok) {
                setView({ kind: "summary" });
              }
            });
          }}
        />
      ) : (
        <SummaryView
          university={university}
          people={people}
          filterId={filterId}
          onAssign={(section, personId) => {
            void send(
              { op: "assign_section", campusId: university.id, section, adminUserId: personId },
              personId
                ? `${people.find((p) => p.id === personId)?.name ?? "Assigned"} now owns ${LADDERS[section].label.toLowerCase()}`
                : `${LADDERS[section].label} unassigned`,
            );
          }}
          open={openSections}
          onToggle={(k) => setOpenSections((o) => ({ ...o, [k]: !o[k] }))}
          cameFrom={cameFrom}
          onStart={() => {
            setRunning(true);
            go(nextReady(university, null, mine));
          }}
          onOpenRecord={(r) => {
            setRunning(false);
            openRecord(r);
          }}
          onAddRecord={(section) => {
            setRunning(false);
            setView({ kind: "new", section });
          }}
          onToggleJobBoard={(recordId, currentVisible) => {
            void send(
              { op: "toggle_job_board_visible", recordId, visible: !currentVisible },
              currentVisible ? "Hidden from job board" : "Now visible on job board",
            );
          }}
        />
      )}

      {failed && (
        <div className="fixed inset-x-0 top-0 z-[70] flex items-start gap-3 border-b border-error-200 bg-error-50 px-5 py-3 text-[13px] text-error-800 shadow-sm">
          <span className="flex-1 leading-snug">
            <b className="font-semibold">Not saved.</b> {failed}
          </span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="shrink-0 rounded-md border border-error-300 bg-white px-2.5 py-1 text-[12px] font-medium text-error-800 hover:bg-error-100"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={() => setFailed(null)}
            aria-label="Dismiss"
            className="shrink-0 px-1 text-error-500 hover:text-error-800"
          >
            ×
          </button>
        </div>
      )}

      {toast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-gray-900 px-4 py-2 text-[12.5px] font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
      {cheer && <Cheer message={cheer} />}
    </DrawerShell>
  );
}

/** Finishing a university should feel like finishing something. */
function Cheer({ message }: { message: string }) {
  return (
    <div className="pointer-events-none fixed inset-y-0 right-0 z-[60] w-full max-w-2xl motion-reduce:hidden">
      <div className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-600 text-[22px] leading-none text-white">
          ✓
        </span>
      </div>
      <div className="absolute left-1/2 top-[calc(42%+46px)] -translate-x-1/2 whitespace-nowrap rounded-full bg-gray-900 px-4 py-2 text-[12.5px] font-semibold text-white shadow-lg">
        {message}
      </div>
    </div>
  );
}

export type { BoardRecord, ContactField };

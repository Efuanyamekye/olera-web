"use client";

import { useState } from "react";
import {
  LADDERS,
  rungAt,
  type ContactField,
  type LadderInput,
  type SectionKey,
} from "@/lib/medjobs/ladders";
import Collateral from "./Collateral";
import { ContactFields } from "./RecordView";
import {
  DEFERRALS,
  STOP_REASONS,
  SWEEP_PREFIX,
  attachmentKind,
  isSaved,
  canReopen,
  formatPhone,
  scriptSlug,
  shortDate,
  strikesAt,
  taskTitle,
  type BoardRecord,
  type BoardTask,
  type FoundRecord,
  FOUND_FIELDS,
  type SweptSection,
} from "@/lib/medjobs/task-board";

/**
 * One task. The record it belongs to is named at the top with its phone and
 * email, because that is what you need in your hand before you press
 * anything.
 *
 * Deferring lives here as one control rather than a "Not yet" button on
 * every rung: putting something off is the same act everywhere, and it is
 * not an outcome. It is offered only where it means something — a rung that
 * already runs on a cadence says `defer: false`, because putting a
 * follow-up off by two days is what the next round is.
 */

const FIELD_LABEL: Record<ContactField, string> = {
  contact: "Contact name",
  role: "Role",
  phone: "Phone",
  email: "Email",
};

const FIELD_HINT: Partial<Record<ContactField, string>> = {
  role: "President, outreach chair…",
};

/**
 * Fill the copy from the record. Every token has a fallback that still
 * reads as a sentence, so a half-filled record never sends "Hi ,".
 */
function fill(text: string, ctx: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => ctx[key] ?? "");
}

export default function TaskView({
  universityName,
  universitySlug,
  record,
  task,
  onOpenRecord,
  permission,
  onAct,
  onDefer,
  onStop,
  onNote,
  onField,
  onFound,
  saving,
  onFieldValue,
  onWebsite,
  onAddress,
  onSaveFields,
  campus,
  onReopen,
  onAgain,
}: {
  universityName: string;
  universitySlug: string;
  record: BoardRecord;
  task: BoardTask;
  onOpenRecord: () => void;
  /** Who approved contacting faculty at this campus, when anybody has. */
  permission?: { approver: string; title: string; named: boolean } | null;
  onAct: (actionIndex: number) => void;
  onDefer: (days: number) => void;
  onStop: (reason: string) => void;
  onNote: (text: string) => void;
  onField: (field: ContactField, value: string) => void;
  /** Research rungs: each addition becomes a record straight away. */
  onFound: (found: FoundRecord[]) => void;
  /** A write is in flight. The found list locks, because each of its
   *  buttons creates, updates or archives a record, and pressing two
   *  before the first has answered is how the same office gets added
   *  twice. */
  saving?: boolean;
  /** A typed value the rung asked for. */
  onFieldValue: (key: string, value: string) => void;
  /** The three record fields a confirming call also puts right. */
  onWebsite: (value: string) => void;
  onAddress: (value: string) => void;
  onSaveFields: () => void;
  /** The other end of the drive, for the directions link. */
  campus?: { name: string; destination: string } | null;
  onReopen: () => void;
  onAgain: () => void;
}) {
  const [showHelp, setShowHelp] = useState(false);
  const [showDefer, setShowDefer] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showStop, setShowStop] = useState(false);
  // "They replied" is the one outcome that carries information nobody can
  // reconstruct later, so it asks for it before moving on. Still here for
  // the advisors and orgs blocks, which keep the single catch-all until
  // refinement 11 decides what their first ask is.
  const [replying, setReplying] = useState(false);
  /**
   * The acts done in this sitting. Deliberately not persisted: the log is
   * the record, and a tick that survives a reload would start claiming a
   * call happened when all that happened was a page refresh.
   */
  const [acted, setActed] = useState<Record<string, boolean>>({});
  /**
   * The outcome being filled in. An outcome with questions does not fire
   * when it is clicked — it opens under the buttons, collects, and fires on
   * confirm. Only "Something else" has any, and only because nobody can
   * guess in advance what a provider will ask for.
   */
  const [picked, setPicked] = useState<number | null>(null);

  const rung = rungAt(task.section, task.step, task.round);
  // Deep-linked to this rung's section of the master scripts document.
  const scriptSection = scriptSlug(task.section, task.step);
  const scriptHref = scriptSection ? `/admin/medjobs/sop/scripts#${scriptSection}` : null;
  if (!rung) return null;
  const ladder = LADDERS[record.section];
  // Unsuccessful goes already logged against this rung. The one in hand is
  // the next one, so the label reads one higher. What they are called and
  // when the warning appears come from the rung: the calling rung counts
  // attempts at reaching somebody, the holding rung counts rounds of a
  // conversation, and neither number stops anybody.
  const repeats = rung.repeats;
  const attempts = repeats ? strikesAt(record, task.step, task.round) : 0;
  // A numbered block counts itself — "Onboarding follow up 4 of 7" is the
  // count — so the warning keys off the round there and off logged attempts
  // everywhere else.
  const reached = rung.rounds ? task.round : attempts;
  // A value the rung exists to capture. Missing it, there is nothing to log.
  const missing = (rung.inputs ?? []).filter(
    (f) => f.required && !(task.fields?.[f.key] ?? "").trim(),
  );

  const chosen = picked === null ? null : rung.actions[picked];
  const chosenMissing = (chosen?.inputs ?? []).filter(
    (f) => f.required && !(task.fields?.[f.key] ?? "").trim(),
  );

  // The acts one of the outcomes is the log of — call them, email them —
  // and whether they are done.
  const acting = rung.actions.find((a) => a.acts);
  const wanted = acting?.acts ?? [];
  const canAct = (kind: string) => (kind === "call" ? Boolean(record.phone) : Boolean(record.email));
  const actsLeft = wanted.filter((k) => canAct(k) && !acted[k]);

  // The flyer is a live URL, not an attachment name. Providers and everyone
  // reaching students get the audience the PDF is written for.
  const flyer = `${typeof window === "undefined" ? "" : window.location.origin}/api/medjobs/program-pdf?university=${
    encodeURIComponent(universitySlug)
  }&audience=${flyerAudience(record.section)}`;

  const ctx: Record<string, string> = {
    university: universityName,
    org: record.name,
    contact: record.contact || record.name,
    first: (record.contact || "there").split(" ")[0],
    role: record.role,
    approver: permission?.approver || task.fields?.approver || "your department",
    // A whole line, or nothing at all. The alternative was two versions of
    // the same email, one naming an approver and one not, which is two
    // things to keep in step and one of them always goes stale.
    approval: permission
      ? `\n${permission.approver}${permission.title ? `, ${permission.title},` : ""} was happy for us to get in touch.\n`
      : "",
    flyer,
  };

  // A sweep fans out into whatever the operator found. Read off the action
  // rather than a flag on the rung, so the one thing that decides whether
  // this rung produces records is the outcome it produces them with.
  const fansOut = rung.actions.some((a) => a.outcome === "fanout");
  const found = task.found ?? [];
  const needsNames = fansOut && found.length === 0;

  // Everyone on the record, not just the first. An advising office names
  // four people as often as one, and the rung that says "send the program
  // info" is exactly where you need to see all of them — the head of
  // advising, the person who runs the newsletter and the one who answers
  // the inbox are rarely the same person. Showing one and hiding the rest
  // meant opening the record to find out who else you could write to.
  const people = [
    { contact: record.contact, role: record.role, phone: record.phone, email: record.email },
    ...(record.others ?? []),
  ].filter((p) => p.contact || p.role || p.phone || p.email);

  return (
    <div className="px-5 py-4">
      {/* Who this is with — when it is with somebody. A task that belongs to
          the university rather than to a person has no record behind it, so
          the line would be a link to a form about nobody, carrying the rung
          title a second time. */}
      {isSaved(record.id) && (
        <button
          type="button"
          onClick={onOpenRecord}
          className="block text-left text-[15px] font-semibold text-gray-900 hover:underline"
        >
          {record.name} <span className="font-normal text-gray-400">›</span>
        </button>
      )}
      {people.length > 0 && (
        <div className="mt-0.5 space-y-0.5">
          {people.map((p, i) => (
            <PersonLine key={i} person={p} />
          ))}
        </div>
      )}

      {task.done ? (
        <div className="mt-4">
          <div className="rounded-md bg-gray-50 px-3 py-2.5 text-[13px] text-gray-700">
            <b className="font-semibold text-gray-900">{task.outcome ?? "Logged"}</b>
            {" · "}
            {task.loggedOn ? shortDate(task.loggedOn) : "earlier"}
          </div>
          <h3 className="mt-4 text-[17px] font-semibold tracking-tight text-gray-900">
            {taskTitle(task)}
          </h3>
          <p className="mt-1 text-[13.5px] text-gray-600">{rung.what}</p>
          <div className="mt-4 border-t border-gray-100 pt-4">
            <Note value={task.note} onChange={onNote} />
          </div>
          {isSaved(record.id) && (
            <Collateral
              recordId={record.id}
              recordKind={attachmentKind(record.section)}
              taskId={task.id}
              label="Attached"
              compact
            />
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {canReopen(record, task) && (
              <button type="button" onClick={onReopen} className={BTN_GO}>
                Reopen it
              </button>
            )}
            <button type="button" onClick={onAgain} className={BTN}>
              Do it again
            </button>
          </div>
          <p className="mt-2 text-[12.5px] text-gray-500">
            {canReopen(record, task)
              ? "Reopening puts this back as ready and removes whatever it queued."
              : "Work has already moved on, so this one can't be unwound. Doing it again adds a fresh task for today."}
          </p>
        </div>
      ) : (
        <div className="mt-4">
          <div className="flex items-start gap-1.5">
            <h3 className="text-[17px] font-semibold tracking-tight text-gray-900">
              {taskTitle(task)}
              {rung.rounds ? <span className="ml-1 text-[14px] font-normal text-gray-400">of {rung.rounds}</span> : null}
            </h3>
            <button
              type="button"
              onClick={() => setShowHelp((v) => !v)}
              aria-label="What this task is"
              aria-expanded={showHelp}
              className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
                showHelp
                  ? "border-primary-600 bg-primary-600 text-white"
                  : "border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-600"
              }`}
            >
              i
            </button>
            {repeats && !rung.rounds && attempts > 0 && (
              <span className="ml-auto shrink-0 pt-1 text-[12px] tabular-nums text-gray-500">
                {repeats.noun} {attempts + 1}
              </span>
            )}
          </div>

          {repeats && reached >= repeats.warnAt && (
            <p className="mt-2 rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-[12.5px] leading-snug text-warning-800">
              {repeats.warning}
            </p>
          )}

          {/* The step's instructions are not printed here any more. They live
              in the scripts document with the call script, the email copy and
              the walkthrough video, where a manager can improve them without
              waiting for a deploy — so the screen points at them rather than
              holding a copy that goes stale. */}
          {showHelp && (
            <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 px-3.5 py-3">
              <Help label={`Goal for ${ladder.label.toLowerCase()}`}>{ladder.goal}</Help>
              {scriptHref && (
                <p className="mt-2.5 border-t border-gray-200 pt-2.5 text-[12.5px]">
                  <a
                    href={scriptHref}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-primary-700 underline hover:no-underline"
                  >
                    Review instructions on this step ↗
                  </a>
                  <span className="mt-0.5 block text-[12px] text-gray-500">
                    What to do and why, the call script, the email copy and the walkthrough
                    video. Anything wrong or missing, suggest a change from that page.
                  </span>
                </p>
              )}
              <p className="mt-2.5 border-t border-gray-200 pt-2.5 text-[12px] text-gray-500">
                Still not sure? Message the team in Slack and someone will pick it up.
              </p>
            </div>
          )}

          {record.flaggedOn && (
            <p className="mt-2 rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-[12.5px] leading-snug text-warning-800">
              <b className="font-semibold">Flagged for manager review.</b> Message the team in Slack
              with what they asked for and how we might help. Clear the flag from the record once it
              is sorted.
            </p>
          )}

          {/* Somewhere to look, when the rung tells you to go and look. */}
          {rung.link && (task.fields?.[rung.link.key] ?? "").trim() && (
            <a
              href={
                /^https?:\/\//i.test(task.fields![rung.link.key])
                  ? task.fields![rung.link.key]
                  : `https://${task.fields![rung.link.key]}`
              }
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2.5 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-primary-700 underline hover:no-underline"
            >
              {rung.link.label}
              <OpenIcon />
            </a>
          )}

          {rung.attachment && <Attachment attachment={rung.attachment} />}

          {/* The two acts a silent round is, with the way to do them to hand. */}
          {wanted.length > 0 && (
            <div className="mt-3 overflow-hidden rounded-md border border-gray-200 bg-gray-50 px-3.5 pb-0.5">
              <p className="pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                If nothing has come back
              </p>
              {wanted.map((kind) => (
                <Act
                  key={kind}
                  kind={kind}
                  label={acting?.actLabels?.[kind]}
                  done={Boolean(acted[kind])}
                  target={kind === "call" ? record.phone : record.email}
                  onDone={() => setActed((v) => ({ ...v, [kind]: true }))}
                  onCopy={
                    kind === "email" && rung.email
                      ? () => navigator.clipboard?.writeText(fill(rung.email!.body, ctx))
                      : undefined
                  }
                />
              ))}
            </div>
          )}

          {rung.confirmDetails ? (
            <ContactFields
              record={record}
              onField={onField}
              onWebsite={onWebsite}
              onAddress={onAddress}
              onSaveFields={onSaveFields}
              campus={campus}
            />
          ) : (
            (rung.collects ?? []).map((f) => (
              <label key={f} className="mt-3 flex items-center gap-2.5">
                <span className="w-20 shrink-0 text-[12px] text-gray-500">{FIELD_LABEL[f]}</span>
                <input
                  value={record[f]}
                  onChange={(e) => onField(f, e.target.value)}
                  placeholder={FIELD_HINT[f] ?? "—"}
                  className="min-w-0 flex-1 rounded-md border border-transparent bg-gray-50 px-2.5 py-1.5 text-[13px] text-gray-900 focus:border-primary-600 focus:bg-white focus:outline-none"
                />
              </label>
            ))
          )}

          {/* The words themselves are not here. They live in one document,
              organised by rung, that anybody can improve the moment they
              learn something — rather than being copied onto each screen
              where only a deploy could fix them. */}
          {(scriptHref || rung.email) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              {scriptHref && (
                <a
                  href={scriptHref}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[12.5px] font-medium text-primary-700 underline hover:no-underline"
                >
                  {rung.scriptLabel
                    ? `Read ${rung.scriptLabel} ↗`
                    : "Instructions, scripts, and email copy ↗"}
                </a>
              )}
              {rung.email && (
                <>
                  <a
                    href={flyer}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[12.5px] font-medium text-primary-700 underline hover:no-underline"
                  >
                    Open the flyer ↗
                  </a>
                  <span className="text-[12px] text-gray-400">
                    Send it from your own inbox so the reply comes back to you.
                  </span>
                </>
              )}
            </div>
          )}

          {fansOut && (
            <FoundList
              found={found}
              noun={rung.foundNoun ?? "one"}
              fields={FOUND_FIELDS[record.section as SweptSection] ?? FOUND_FIELDS.providers}
              onChange={onFound}
              saving={saving}
            />
          )}

          {(rung.inputs ?? []).map((f) => (
            <Field
              key={f.key}
              field={f}
              value={task.fields?.[f.key] ?? ""}
              onChange={(v: string) => onFieldValue(f.key, v)}
            />
          ))}

          <div className="mt-4 border-t border-gray-100 pt-4">
            {!replying && <Note value={task.note} label={rung.textarea} onChange={onNote} />}
            {/* Beside the note, on the task being worked — a screenshot of
                the reply belongs with the call it came from, and attaching
                it afterwards means finding the task again. This sat in the
                finished-task branch by mistake, so it only ever appeared on
                work already done. The sweeps have synthetic ids and are not
                records, so they get nothing to attach to. */}
            {!replying && isSaved(record.id) && (
              <Collateral
                recordId={record.id}
                recordKind={attachmentKind(record.section)}
                taskId={task.id}
                label="Attached"
                compact
              />
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {rung.actions.map((a, i) => {
              if (a.secondary) return null;
              // Nothing to fan out to, nothing to log, or the two acts this
              // outcome is the log of still to do: the same idea. An outcome
              // that closes the record is never blocked — a provider who says
              // no does not owe us a phone call first.
              const closes = a.outcome === "archive" || a.outcome === "closed";
              const blocked =
                (needsNames && a.outcome === "fanout") ||
                (missing.length > 0 && !closes) ||
                ((a.acts?.length ?? 0) > 0 && actsLeft.length > 0);
              return (
                <button
                  key={a.label}
                  type="button"
                  disabled={blocked}
                  onClick={() =>
                    (a.inputs?.length ?? 0) > 0 ? setPicked(picked === i ? null : i) : onAct(i)
                  }
                  title={a.hint}
                  className={`${
                    i === picked
                      ? BTN_GO
                      : a.quiet
                        ? // In the row so it can be found, outlined so it does
                          // not read as the answer. It is on every rung and it
                          // is the answer on almost none of them.
                          BTN_QUIET
                        : i === 0
                          ? BTN_GO
                          : a.outcome === "closed" || a.outcome === "archive"
                            ? BTN_BAD
                            : BTN
                  } ${blocked ? "cursor-not-allowed opacity-40" : ""}`}
                >
                  {a.outcome === "archive" && repeats?.archive && reached >= repeats.warnAt
                    ? `Archive — ${attempts} ${repeats.noun}s`
                    : a.label}
                </button>
              );
            })}

            {rung.reply && (
              <button
                type="button"
                onClick={() => {
                  setReplying(true);
                  setShowDefer(false);
                  setShowStop(false);
                }}
                className={BTN}
              >
                They replied
              </button>
            )}

            {/*
              Stopping is about a record somebody keeps contacting: a wrong
              number, a person who left, an agency that asked us to stop. A
              channel has none of those. The status it can take instead is
              "not available here", which belongs with the channel rather
              than on a task, and is not built yet.
            */}
            <button
              type="button"
              aria-label="More"
              aria-expanded={showMore}
              onClick={() => {
                setShowMore((v) => !v);
                setShowDefer(false);
                setShowStop(false);
              }}
              className={`${showMore ? BTN_GO : BTN} tracking-widest`}
            >
              ···
            </button>
          </div>

          {chosen && (
            <div className="mt-3 rounded-md border border-primary-200 bg-primary-25 px-3.5 py-3">
              {chosen.hint && <p className="text-[12.5px] text-gray-600">{chosen.hint}</p>}
              {(chosen.inputs ?? []).map((f) => (
                <Field
                  key={f.key}
                  field={f}
                  value={task.fields?.[f.key] ?? ""}
                  onChange={(v: string) => onFieldValue(f.key, v)}
                />
              ))}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={chosenMissing.length > 0}
                  onClick={() => {
                    const i = picked;
                    setPicked(null);
                    if (i !== null) onAct(i);
                  }}
                  className={chosenMissing.length ? `${BTN_GO} cursor-not-allowed opacity-40` : BTN_GO}
                >
                  Queue it
                </button>
                <button type="button" onClick={() => setPicked(null)} className={BTN}>
                  Cancel
                </button>
                {chosenMissing.length > 0 && (
                  <span className="text-[12px] text-gray-500">{needLine(chosenMissing)}</span>
                )}
              </div>
            </div>
          )}

          {missing.length > 0 && (
            <p className="mt-2 text-[12.5px] text-gray-500">{needLine(missing)}</p>
          )}

          {replying && (
            <div className="mt-3 rounded-md border border-primary-200 bg-primary-25 px-3.5 py-3">
              <label
                htmlFor="reply-note"
                className="text-[11px] font-semibold uppercase tracking-wide text-primary-800"
              >
                What they said
              </label>
              <p className="mt-0.5 text-[12px] text-gray-600">
                Paste their reply or write the gist, and anything they asked for. This is the
                only record of it.
              </p>
              <textarea
                id="reply-note"
                autoFocus
                value={task.note}
                onChange={(e) => onNote(e.target.value)}
                rows={4}
                placeholder="Paste the reply here…"
                className="mt-2 w-full resize-y rounded-md border border-gray-300 px-2.5 py-2 text-[13px] text-gray-900 placeholder:text-gray-400 focus:border-primary-600 focus:outline-none"
              />
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!task.note.trim()}
                  onClick={() => {
                    setReplying(false);
                    onAct(-1);
                  }}
                  className={task.note.trim() ? BTN_GO : `${BTN_GO} cursor-not-allowed opacity-40`}
                >
                  Save and move on
                </button>
                <button type="button" onClick={() => setReplying(false)} className={BTN}>
                  Cancel
                </button>
                {!task.note.trim() && (
                  <span className="text-[12px] text-gray-500">Write something first.</span>
                )}
              </div>
            </div>
          )}

          {/*
            Everything available on every rung, out of the row. Booking a
            call and logging something nobody foresaw are the two things an
            operator can always do, and two buttons on every screen for them
            is two buttons of noise on every screen.
          */}
          {showMore && (
            <div className="mt-2.5 overflow-hidden rounded-md border border-gray-200">
              {rung.actions.map((a, i) =>
                a.secondary ? (
                  <button
                    key={a.label}
                    type="button"
                    onClick={() => {
                      setShowMore(false);
                      if ((a.inputs?.length ?? 0) > 0) setPicked(i);
                      else onAct(i);
                    }}
                    className="block w-full border-b border-gray-100 px-3 py-2.5 text-left text-[12.5px] text-gray-700 last:border-b-0 hover:bg-gray-50"
                  >
                    {a.label}
                    {a.hint && <span className="block text-[11.5px] text-gray-400">{a.hint}</span>}
                  </button>
                ) : null,
              )}
              {rung.defer !== false && (
                <button
                  type="button"
                  onClick={() => {
                    setShowMore(false);
                    setShowDefer(true);
                  }}
                  className="block w-full border-b border-gray-100 px-3 py-2.5 text-left text-[12.5px] text-gray-700 last:border-b-0 hover:bg-gray-50"
                >
                  Defer task
                  <span className="block text-[11.5px] text-gray-400">
                    Put it off. Nothing else about the record changes.
                  </span>
                </button>
              )}
              {record.section !== "jobboard" && (
                <button
                  type="button"
                  onClick={() => {
                    setShowMore(false);
                    setShowStop(true);
                  }}
                  className="block w-full px-3 py-2.5 text-left text-[12.5px] text-error-700 hover:bg-error-50"
                >
                  Can&apos;t be done
                  <span className="block text-[11.5px] text-gray-400">
                    Wrong number, they have left, they asked us to stop.
                  </span>
                </button>
              )}
            </div>
          )}

          {showDefer && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {DEFERRALS.map((d) => (
                <button
                  key={d.label}
                  type="button"
                  onClick={() => onDefer(d.days)}
                  className="rounded-full border border-gray-300 bg-gray-50 px-3 py-1.5 text-[12.5px] font-medium text-gray-700 hover:border-primary-600 hover:text-primary-700"
                >
                  {d.label}
                </button>
              ))}
            </div>
          )}

          {showStop && (
            <div className="mt-2.5 overflow-hidden rounded-md border border-gray-200">
              {STOP_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => onStop(r)}
                  className="block w-full border-b border-gray-100 px-3 py-2.5 text-left text-[12.5px] text-gray-700 last:border-b-0 hover:bg-gray-50"
                >
                  {r}
                </button>
              ))}
            </div>
          )}

        </div>
      )}
    </div>
  );
}

/**
 * A document to look at while doing the rung.
 *
 * Served through the guarded SOP route by key, never as a public URL: these
 * are internal, and the route is the one place that decides who sees them.
 */
/**
 * Which flyer a section sends.
 *
 * An advising office is not being sold anything and is not the employer, so
 * the agency brochure would be answering questions they never asked. They get
 * the same programme described as the student's opportunity. Everything that
 * is neither a student nor an advising office gets the provider brochure,
 * which is what it was written for.
 */
function flyerAudience(section: SectionKey): "student" | "advisor" | "provider" | "recruit" {
  if (section === "students") return "student";
  if (section === "advisors") return "advisor";
  // A student org forwards what it is given to its members. That is the
  // one-page recruitment flyer — the same sheet the advisor document ends
  // with — not a brochure about the programme written for somebody else.
  if (section === "orgs") return "recruit";
  return "provider";
}

const summarise = (f: FoundRecord) => {
  const line = [f.date, f.address, f.contact, f.role, f.phone, f.email, f.website]
    .filter(Boolean)
    .join(" · ");
  const more = (f.others ?? []).length;
  return more > 0 ? `${line}${line ? " · " : ""}+${more} more` : line;
};

/**
 * One person on the record: who they are, what they do there, and the two
 * ways to reach them.
 *
 * The role earns its place here. On an advising office it is the whole
 * reason you picked this person out of four — "Director" and "Program
 * Coordinator" want different emails — and it was the one field the task
 * screen never showed.
 */
function PersonLine({
  person,
}: {
  person: { contact?: string; role?: string; phone?: string; email?: string };
}) {
  const bits = [
    person.contact ? <span key="n" className="text-gray-700">{person.contact}</span> : null,
    person.role ? <span key="r">{person.role}</span> : null,
    person.phone ? (
      <a
        key="p"
        href={`tel:${person.phone.replace(/[^\d+]/g, "")}`}
        className="text-primary-700 hover:underline"
      >
        {person.phone}
      </a>
    ) : null,
    person.email ? (
      <a key="e" href={`mailto:${person.email}`} className="text-primary-700 hover:underline">
        {person.email}
      </a>
    ) : null,
  ].filter(Boolean);
  if (bits.length === 0) return null;
  return (
    <p className="text-[12.5px] text-gray-500">
      {bits.map((bit, i) => (
        <span key={i}>
          {i > 0 && <span className="px-1 text-gray-300">·</span>}
          {bit}
        </span>
      ))}
    </p>
  );
}

/**
 * What a sweep found, and the form for adding one more.
 *
 * The form is the record's own fields, in the record's own order and with
 * the record's own labels. Somebody adding an agency is looking at its
 * website while they do it — giving them three boxes now and asking for the
 * rest on a later rung is asking them to find the same page twice.
 *
 * Every change here reaches a record. Add creates one, Edit updates it, and
 * × archives it — the list is a receipt of what the sweep produced, not a
 * holding pen that turns into records when the sweep is finished.
 */
function FoundList({
  found,
  noun,
  fields,
  onChange,
  saving,
}: {
  found: FoundRecord[];
  /** What one of these is called, for the empty form's first box. */
  noun: string;
  /** What this section asks for. A student org has no postal address and a
   *  professor has a department rather than one. */
  fields: Array<{ key: keyof FoundRecord; label: string }>;
  onChange: (next: FoundRecord[]) => void;
  /** A write is in flight, so nothing that writes may be pressed. */
  saving?: boolean;
}) {
  const [draft, setDraft] = useState<FoundRecord>({ name: "" });
  /** Which row is being corrected, or null when adding a new one. */
  const [editing, setEditing] = useState<number | null>(null);

  const reset = () => {
    setDraft({ name: "" });
    setEditing(null);
  };

  const commit = () => {
    const name = draft.name.trim();
    if (!name) return;
    const clean: FoundRecord = {
      ...draft,
      name,
      others: (draft.others ?? []).filter((o) => o.contact || o.role || o.phone || o.email),
    };
    if (editing === null) onChange([...found, clean]);
    else onChange(found.map((f, i) => (i === editing ? clean : f)));
    reset();
  };

  const set = (key: keyof FoundRecord, value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));

  return (
    <div className="mt-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        Added{found.length > 0 ? ` · ${found.length}` : ""}
      </p>

      {found.length > 0 && (
        <ul className="mt-1">
          {found.map((f, i) => (
            <li
              key={f.id ?? `${f.name}-${i}`}
              className="flex items-start gap-2 border-b border-gray-100 py-2 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] text-gray-900">{f.name}</p>
                {summarise(f) && (
                  <p className="truncate text-[11.5px] text-gray-500">{summarise(f)}</p>
                )}
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setDraft(f);
                  setEditing(i);
                }}
                className="shrink-0 text-[11.5px] text-gray-400 underline hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Edit
              </button>
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                title={`Remove ${f.name}. It was created as a record when it was added, so removing it here archives that record.`}
                disabled={saving}
                onClick={() => {
                  onChange(found.filter((_, j) => j !== i));
                  if (editing === i) reset();
                }}
                className="shrink-0 px-1 text-[15px] leading-none text-gray-400 hover:text-error-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 rounded-md border border-dashed border-primary-300 bg-primary-25 p-3">
        <input
          value={draft.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder={`${noun} name`}
          className="mb-1.5 w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-[14px] font-semibold text-gray-900 placeholder:font-normal placeholder:text-gray-400 focus:border-primary-600 focus:outline-none"
        />
        <div className="space-y-1.5">
          {fields.map((f) => (
            <label key={f.key} className="flex items-center gap-2.5">
              <span className="w-24 shrink-0 text-[12px] text-gray-500">{f.label}</span>
              <input
                value={(draft[f.key] as string) ?? ""}
                onChange={(e) => set(f.key, e.target.value)}
                onBlur={() => {
                  if (f.key === "phone" && draft.phone) set("phone", formatPhone(draft.phone));
                }}
                placeholder="—"
                className="min-w-0 flex-1 rounded-md border border-transparent bg-white px-2.5 py-1.5 text-[13px] text-gray-900 placeholder:text-gray-400 focus:border-primary-600 focus:outline-none"
              />
            </label>
          ))}
        </div>
        {/* An advising office lists four people as often as one, so the
            form takes as many as the page does rather than one and a spare. */}
        {(draft.others ?? []).map((o, i) => (
          <div key={i} className="mt-2 border-t border-primary-200 pt-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] font-medium text-gray-400">
                {o.contact.trim() || `Contact ${i + 2}`}
              </span>
              <button
                type="button"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    others: (d.others ?? []).filter((_, j) => j !== i),
                  }))
                }
                className="text-[11.5px] text-gray-400 underline hover:text-error-700"
              >
                Remove
              </button>
            </div>
            <div className="space-y-1.5">
              {(["contact", "role", "phone", "email"] as const).map((k) => (
                <label key={k} className="flex items-center gap-2.5">
                  <span className="w-24 shrink-0 text-[12px] text-gray-500">
                    {k === "contact" ? "Name" : k === "role" ? "Role" : k === "phone" ? "Phone" : "Email"}
                  </span>
                  <input
                    value={o[k]}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        others: (d.others ?? []).map((x, j) =>
                          j === i ? { ...x, [k]: e.target.value } : x,
                        ),
                      }))
                    }
                    placeholder="—"
                    className="min-w-0 flex-1 rounded-md border border-transparent bg-white px-2.5 py-1.5 text-[13px] text-gray-900 placeholder:text-gray-400 focus:border-primary-600 focus:outline-none"
                  />
                </label>
              ))}
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() =>
            setDraft((d) => ({
              ...d,
              others: [...(d.others ?? []), { contact: "", role: "", phone: "", email: "" }],
            }))
          }
          className="mt-2 text-[12.5px] font-medium text-primary-700 hover:underline"
        >
          + Add another contact
        </button>

        <div className="mt-2.5 flex items-center gap-2">
          <button
            type="button"
            onClick={commit}
            disabled={!draft.name.trim() || saving}
            className={draft.name.trim() && !saving ? BTN : `${BTN} cursor-not-allowed opacity-40`}
          >
            {saving ? "Saving…" : editing === null ? "Add" : "Save"}
          </button>
          {editing !== null && (
            <button
              type="button"
              onClick={reset}
              className="text-[12.5px] text-gray-500 underline hover:text-gray-900"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function Attachment({ attachment }: { attachment: { label: string; doc: string } }) {
  return (
    <a
      href={`/api/admin/medjobs/sop?doc=${encodeURIComponent(attachment.doc)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2.5 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-primary-700 hover:underline"
    >
      <DocIcon />
      {attachment.label}
    </a>
  );
}

function DocIcon() {
  return (
    <svg
      viewBox="0 0 14 14"
      aria-hidden="true"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8.1 1.4H4a1.3 1.3 0 0 0-1.3 1.3v8.6A1.3 1.3 0 0 0 4 12.6h6a1.3 1.3 0 0 0 1.3-1.3V4.6z" />
      <path d="M8.1 1.4v3.2h3.2" />
    </svg>
  );
}

function Help({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2 last:mb-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <div className="text-[13px] leading-snug text-gray-700">{children}</div>
    </div>
  );
}

/** The usual little arrow for a link that leaves the drawer. */
function OpenIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M6 3h7v7M13 3 5 11M11 9v4H3V5h4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** What is still missing, said as an instruction rather than a field list. */
function needLine(missing: LadderInput[]): string {
  const bits = missing.map((f) => f.needs ?? `fill in the ${f.label.toLowerCase()}`);
  const line = bits.join(" and ");
  return `${line.charAt(0).toUpperCase()}${line.slice(1)} first.`;
}

/**
 * One of the two things a follow-up round is, with the way to do it next to
 * it and a tick that says it is done.
 *
 * The tick is the point. The rung has always said *call, then email*, and
 * the button under it said "No reply" — which names what the provider did
 * not do and logs nothing that we did. Here the button underneath cannot be
 * pressed until both are, and then it logs two acts.
 */
function Act({
  kind,
  label: given,
  done,
  target,
  onDone,
  onCopy,
}: {
  kind: "call" | "email";
  /** What this act is here, when the default does not describe it. */
  label?: string;
  done: boolean;
  /** The number or address. Missing means this act is not available here. */
  target: string;
  onDone: () => void;
  onCopy?: () => void;
}) {
  const label = given ?? (kind === "call" ? "Call them" : "Email them, resending the programme");
  if (!target) {
    return (
      <div className="border-b border-gray-200 py-2 text-[13px] text-gray-500 last:border-b-0">
        {label} — <span className="text-gray-400">nothing on file to reach them on.</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2.5 border-b border-gray-200 py-2 last:border-b-0">
      <button
        type="button"
        onClick={onDone}
        aria-pressed={done}
        aria-label={done ? `${label}, done` : label}
        className={`flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded border text-[11px] font-bold ${
          done ? "border-primary-600 bg-primary-600 text-white" : "border-gray-300 text-transparent hover:border-gray-400"
        }`}
      >
        ✓
      </button>
      <span className={`flex-1 text-[13.5px] ${done ? "text-gray-400 line-through" : "text-gray-900"}`}>
        {label}
      </span>
      {kind === "call" ? (
        <a
          href={`tel:${target.replace(/[^\d+]/g, "")}`}
          onClick={onDone}
          className="shrink-0 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-[12px] font-semibold text-primary-700 hover:bg-gray-50"
        >
          Call {target}
        </a>
      ) : (
        <button
          type="button"
          onClick={() => {
            onCopy?.();
            onDone();
          }}
          className="shrink-0 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-[12px] font-semibold text-primary-700 hover:bg-gray-50"
        >
          Copy the email
        </button>
      )}
    </div>
  );
}

/**
 * A value an outcome asked for. A date is a date picker, a choice is a row
 * of chips, and a yes/no is a checkbox — because a box you can type
 * anything into is a box that will collect anything.
 */
function Field({
  field,
  value,
  onChange,
}: {
  field: LadderInput;
  value: string;
  onChange: (v: string) => void;
}) {
  if (field.type === "check") {
    const on = Boolean(value);
    return (
      <button
        type="button"
        onClick={() => onChange(on ? "" : "yes")}
        aria-pressed={on}
        className="mt-3 flex w-full items-start gap-2.5 rounded-md border border-primary-200 bg-white px-3 py-2.5 text-left hover:border-primary-600"
      >
        <span
          className={`mt-0.5 flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded border text-[11px] font-bold ${
            on ? "border-primary-600 bg-primary-600 text-white" : "border-gray-300 text-transparent"
          }`}
        >
          ✓
        </span>
        <span className="text-[13px] text-gray-800">{field.label}</span>
      </button>
    );
  }
  return (
    <label className="mt-3 flex items-center gap-2.5">
      <span className="w-24 shrink-0 text-[12px] text-gray-500">
        {field.label}
        {field.required && <span className="ml-0.5 text-error-600">*</span>}
      </span>
      <input
        type={field.type ?? "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.type === "url" ? "https://…" : "—"}
        className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-[13px] text-gray-900 focus:border-primary-600 focus:outline-none"
      />
    </label>
  );
}

function Note({
  value,
  label,
  onChange,
}: {
  value: string;
  /** What this rung wants written down, when it wants something specific. */
  label?: string;
  onChange: (v: string) => void;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={label ? `${label}…` : "Please leave a note before logging."}
      rows={2}
      className="mt-3 w-full resize-y rounded-md border border-gray-300 px-2.5 py-2 text-[13px] text-gray-900 placeholder:text-gray-400 focus:border-primary-600 focus:outline-none"
    />
  );
}

const BTN =
  "rounded-md border border-gray-300 bg-white px-3 py-2 text-[12.5px] font-semibold text-gray-800 hover:bg-gray-50";
const BTN_GO =
  "rounded-md border border-primary-600 bg-primary-600 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-primary-700";
const BTN_BAD =
  "rounded-md border border-error-200 bg-white px-3 py-2 text-[12.5px] font-semibold text-error-700 hover:bg-error-50";
// Always present, rarely the answer. Teal so it reads as a real option
// rather than a disabled one, outlined so it does not compete with the
// filled button beside it.
const BTN_QUIET =
  "rounded-md border border-primary-600 bg-white px-3 py-2 text-[12.5px] font-semibold text-primary-700 hover:bg-primary-50";

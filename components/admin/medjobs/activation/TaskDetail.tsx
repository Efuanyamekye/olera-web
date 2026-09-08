"use client";

import { useState } from "react";
import { DrawerShell } from "@/components/admin/medjobs/DrawerShell";
import { TASK_DEFS, fillTemplate } from "@/lib/medjobs/activation-tasks";
import Copyable from "./Copyable";
import { DueDot } from "./StatusDot";
import { shortDate } from "./types";
import type { ActivationTask } from "./TasksTab";

/**
 * A task, opened. Two shapes: a CHECK is a chore and offers Mark done; a
 * CRITERION is a question and offers the answer instead, because saying
 * yes here ticks the box in the university record. One write, so the task
 * and the checklist cannot end up disagreeing.
 */
export default function TaskDetail({
  task,
  onClose,
  onAct,
  onOpenUniversity,
}: {
  task: ActivationTask;
  onClose: () => void;
  onAct: (action: "complete" | "skip" | "checklist", checklist?: Array<{ text: string; done: boolean }>) => Promise<void>;
  onOpenUniversity: (slug: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [checklist, setChecklist] = useState(task.checklist ?? []);
  const custom = task.taskType === "manual_followup";
  const def = custom ? null : TASK_DEFS[task.taskType as keyof typeof TASK_DEFS];
  const title = custom ? (task.payload?.title as string) ?? "Task" : def!.title;
  const overdue = new Date(task.dueAt).getTime() <= Date.now();
  const contactName = task.record?.name ?? "there";

  const act = async (a: "complete" | "skip") => {
    setBusy(true);
    try {
      await onAct(a);
    } finally {
      setBusy(false);
    }
  };

  const tick = async (i: number, done: boolean) => {
    const next = checklist.map((c, j) => (j === i ? { ...c, done } : c));
    setChecklist(next);
    await onAct("checklist", next);
  };

  return (
    <DrawerShell
      onClose={onClose}
      header={
        <div>
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <p className="mt-0.5 text-xs">
            {task.university ? (
              <button
                type="button"
                onClick={() => onOpenUniversity(task.university!.slug)}
                className="text-primary-700 underline-offset-2 hover:underline"
              >
                {task.university.name}
                {task.channel ? ` · ${task.channel.toUpperCase()}` : ""}
                {task.record ? ` · ${task.record.name}` : ""} →
              </button>
            ) : null}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
            {overdue ? <DueDot /> : null}
            Due {shortDate(task.dueAt)}
            {overdue ? " · overdue" : ""}
          </p>
        </div>
      }
    >
      <div className="space-y-4 py-2">
        {def ? (
          <>
            <Block label="What this is" text={def.what} />
            <Block label="Why" text={def.why} />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Steps</p>
              <ol className="mt-1 list-decimal space-y-1 pl-5">
                {def.steps.map((s, i) => (
                  <li key={i} className="text-[13px] text-gray-700">
                    {s}
                  </li>
                ))}
              </ol>
            </div>
            {def.email ? (
              <Copyable
                label="Suggested email"
                subject={def.email.subject}
                body={fillTemplate(def.email.body, { contact: contactName })}
              />
            ) : null}
            {def.script ? <Copyable label="Call or meeting script" body={def.script} /> : null}
            <Block label="Done when" text={def.doneWhen} />
          </>
        ) : (
          <>
            {task.notes ? <Block label="Details" text={task.notes} /> : null}
            {checklist.length > 0 ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Checklist
                </p>
                <ul className="mt-1 space-y-1">
                  {checklist.map((c, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={c.done}
                        onChange={(e) => void tick(i, e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span
                        className={`text-[13px] ${c.done ? "text-gray-400 line-through" : "text-gray-800"}`}
                      >
                        {c.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}

        <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
          {def?.kind === "criterion" ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void act("complete")}
                className="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
              >
                Yes, they agreed
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void act("skip")}
                className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Not yet, ask again
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void act("complete")}
                className="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
              >
                Mark done
              </button>
              {task.repeatMonths ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void act("skip")}
                  className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Skip this cycle
                </button>
              ) : null}
            </>
          )}
        </div>

        {task.repeatMonths ? (
          <p className="text-[11px] text-gray-500">
            Repeats every {task.repeatMonths} month{task.repeatMonths > 1 ? "s" : ""}. The next one
            is created when this is closed.
          </p>
        ) : null}
      </div>
    </DrawerShell>
  );
}

function Block({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-0.5 whitespace-pre-line text-[13px] text-gray-700">{text}</p>
    </div>
  );
}

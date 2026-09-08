"use client";

import { useCallback, useEffect, useState } from "react";
import { TASK_DEFS } from "@/lib/medjobs/activation-tasks";
import type { TaskType } from "@/lib/medjobs/activation";
import { DueDot } from "./StatusDot";
import { shortDate } from "./types";
import TaskDetail from "./TaskDetail";
import NewTaskModal from "./NewTaskModal";

/**
 * Everything the system generated, plus whatever the manager added.
 *
 * Grouped by urgency rather than by university: this tab is the queue, and
 * the University Activation tab is the roster. Every row carries its
 * university and channel, which is both the label and the way back.
 */

export interface ActivationTask {
  id: string;
  taskType: TaskType;
  dueAt: string;
  status: "pending" | "completed" | "cancelled" | "superseded";
  channel: string | null;
  answersCriterion: string | null;
  repeatMonths: number | null;
  notes: string | null;
  checklist: Array<{ text: string; done: boolean }>;
  payload: Record<string, unknown>;
  completedAt: string | null;
  university: { id: string; slug: string; name: string } | null;
  campusId: string;
  record: { id: string; name: string } | null;
  recordId: string | null;
}

function titleOf(t: ActivationTask) {
  if (t.taskType === "manual_followup") return (t.payload?.title as string) ?? "Task";
  return TASK_DEFS[t.taskType as keyof typeof TASK_DEFS]?.title ?? t.taskType;
}

export default function TasksTab({
  openTaskId,
  onOpenUniversity,
}: {
  /** Set when the manager arrived here by clicking a next-check date. */
  openTaskId?: string | null;
  onOpenUniversity: (slug: string) => void;
}) {
  const [tasks, setTasks] = useState<ActivationTask[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(openTaskId ?? null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/medjobs/activation/tasks");
      if (!res.ok) throw new Error(String(res.status));
      const d = (await res.json()) as { tasks: ActivationTask[] };
      setTasks(d.tasks);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (openTaskId) setOpenId(openTaskId);
  }, [openTaskId]);

  const act = async (
    taskId: string,
    action: "complete" | "skip" | "checklist",
    checklist?: Array<{ text: string; done: boolean }>,
  ) => {
    await fetch("/api/admin/medjobs/activation/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, action, checklist }),
    });
    await load();
    if (action !== "checklist") setOpenId(null);
  };

  if (failed) return <p className="px-1 py-8 text-sm text-gray-500">Tasks could not be loaded.</p>;
  if (!tasks) return <p className="px-1 py-8 text-sm text-gray-500">Loading tasks…</p>;

  const now = Date.now();
  const startOfTomorrow = new Date();
  startOfTomorrow.setHours(24, 0, 0, 0);

  const pending = tasks.filter((t) => t.status === "pending");
  const overdue = pending.filter((t) => new Date(t.dueAt).getTime() < new Date().setHours(0, 0, 0, 0));
  const today = pending.filter(
    (t) =>
      new Date(t.dueAt).getTime() >= new Date().setHours(0, 0, 0, 0) &&
      new Date(t.dueAt).getTime() < startOfTomorrow.getTime(),
  );
  const upcoming = pending.filter((t) => new Date(t.dueAt).getTime() >= startOfTomorrow.getTime());
  const done = tasks.filter((t) => t.status === "completed").slice(0, 20);

  const open = tasks.find((t) => t.id === openId) ?? null;

  return (
    <>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-md border border-primary-200 px-2.5 py-1 text-xs font-semibold text-primary-700 hover:bg-primary-50"
        >
          + Task
        </button>
      </div>

      {pending.length === 0 && done.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 px-4 py-10 text-center">
          <p className="text-sm font-medium text-gray-900">Nothing due</p>
        </div>
      ) : (
        <div className="space-y-5">
          <Group label="Overdue" tasks={overdue} onOpen={setOpenId} now={now} />
          <Group label="Today" tasks={today} onOpen={setOpenId} now={now} />
          <Group label="Upcoming" tasks={upcoming} onOpen={setOpenId} now={now} />
          <Group label="Done" tasks={done} onOpen={setOpenId} now={now} muted />
        </div>
      )}

      {open ? (
        <TaskDetail
          task={open}
          onClose={() => setOpenId(null)}
          onAct={(a, c) => act(open.id, a, c)}
          onOpenUniversity={onOpenUniversity}
        />
      ) : null}

      {creating ? (
        <NewTaskModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void load();
          }}
        />
      ) : null}
    </>
  );
}

function Group({
  label,
  tasks,
  onOpen,
  now,
  muted,
}: {
  label: string;
  tasks: ActivationTask[];
  onOpen: (id: string) => void;
  now: number;
  muted?: boolean;
}) {
  if (tasks.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <div className="divide-y divide-gray-100 border-y border-gray-100">
        {tasks.map((t) => {
          const overdue = new Date(t.dueAt).getTime() <= now && t.status === "pending";
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onOpen(t.id)}
              className="flex w-full items-start gap-2.5 py-2.5 text-left hover:bg-gray-50"
            >
              <span className="mt-1 w-2 shrink-0">{overdue ? <DueDot /> : null}</span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-[13px] ${muted ? "text-gray-400 line-through" : "font-medium text-gray-900"}`}
                >
                  {titleOf(t)}
                </span>
                <span className="block text-[12px] text-gray-500">
                  {t.university?.name ?? "No university"}
                  {t.channel ? ` · ${t.channel.toUpperCase()}` : ""}
                  {t.record ? ` · ${t.record.name}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-[12px] tabular-nums text-gray-500">
                {shortDate(t.dueAt)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

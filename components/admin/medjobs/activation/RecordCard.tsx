"use client";

import { useState } from "react";
import { RECORDS } from "@/lib/medjobs/activation";
import StatusDot, { DueDot } from "./StatusDot";
import LiveWinChecklist from "./LiveWinChecklist";
import History from "./History";
import SuccessToast from "./SuccessToast";
import Copyable from "./Copyable";
import { CHANNEL_ASSETS, fillTemplate } from "@/lib/medjobs/activation-tasks";
import { shortDate, type ActivationRecord } from "./types";

/**
 * One organization, event or professor. All three share this shape because
 * all three are a named thing with a Live Win, its own contacts and its own
 * next check; their differences are fields, not structure.
 */
export default function RecordCard({
  record,
  channel,
  approver,
  onToggle,
  onNote,
  onDecline,
  onOpenTask,
}: {
  record: ActivationRecord;
  channel: string;
  /** ST7 only: who cleared the outreach, cited in the professor email. */
  approver?: string;
  onToggle: (key: string, checked: boolean) => Promise<{ wentLive: boolean } | void>;
  onNote: (text: string) => Promise<void>;
  onDecline: (reason: string) => Promise<void>;
  onOpenTask: (taskId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [win, setWin] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const def = RECORDS[record.kind];
  const asset = CHANNEL_ASSETS[channel];

  const primary = record.contacts[0];
  const detail = record.detail as Record<string, string | undefined>;

  const toggle = async (key: string, checked: boolean) => {
    const res = await onToggle(key, checked);
    if (res && res.wentLive) setWin(true);
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50"
      >
        <StatusDot status={record.status} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-gray-900">
          {record.name}
        </span>
        <span className="hidden shrink-0 text-[12px] text-gray-500 sm:inline">
          {primary?.name ?? "no contact"}
        </span>
        {record.nextCheck ? (
          <span className="flex shrink-0 items-center gap-1 text-[12px] tabular-nums text-gray-600">
            {record.due ? <DueDot /> : null}
            {shortDate(record.nextCheck.dueAt)}
          </span>
        ) : null}
        <span className="shrink-0 text-gray-400" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </button>

      {open ? (
        <div className="space-y-3 border-t border-gray-100 px-3 py-3">
          {win ? (
            <SuccessToast
              title={`${record.name} is live`}
              detail={def.cadenceMonths ? `Next check in ${def.cadenceMonths} month${def.cadenceMonths > 1 ? "s" : ""}.` : undefined}
              onDone={() => setWin(false)}
            />
          ) : null}

          {record.status === "declined" ? (
            <p className="rounded-md bg-gray-50 px-2 py-1.5 text-[12px] text-gray-600">
              Declined. {record.statusReason}
            </p>
          ) : (
            <LiveWinChecklist
              liveWhen={def.liveWhen}
              rule={def.rule}
              items={def.criteria}
              criteria={record.criteria}
              onToggle={toggle}
            />
          )}

          {/* A professor who agreed to a class visit needs the visit pinned
              down: format, when, and which team member is presenting. */}
          {record.kind === "professor" && record.criteria.class_visit ? (
            <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1 text-[12px]">
              <dt className="text-gray-500">Format</dt>
              <dd className="text-gray-800">{detail.visit_format ?? "not set"}</dd>
              <dt className="text-gray-500">When</dt>
              <dd className="text-gray-800">{detail.visit_at ?? "not set"}</dd>
              <dt className="text-gray-500">Presenter</dt>
              <dd className="text-gray-800">{detail.presenter ?? "not assigned"}</dd>
            </dl>
          ) : null}

          {record.kind === "event" ? (
            <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1 text-[12px]">
              <dt className="text-gray-500">Date</dt>
              <dd className="text-gray-800">{detail.date ?? "not set"}</dd>
              <dt className="text-gray-500">Format</dt>
              <dd className="text-gray-800">{detail.format ?? "not set"}</dd>
              <dt className="text-gray-500">Presenter</dt>
              <dd className="text-gray-800">{detail.presenter ?? "not assigned"}</dd>
              <dt className="text-gray-500">Collateral</dt>
              <dd className="text-gray-800">{detail.collateral ?? "not ready"}</dd>
            </dl>
          ) : null}

          {record.contacts.length > 0 ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Contacts
              </p>
              <ul className="mt-1 space-y-0.5">
                {record.contacts.map((c, i) => (
                  <li key={i} className="text-[12px] text-gray-700">
                    {c.name}
                    {c.role ? ` · ${c.role}` : ""}
                    {c.email ? ` · ${c.email}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {record.kind === "professor" && asset ? (
            <Copyable
              label="Suggested email"
              subject={asset.email.subject}
              body={fillTemplate(asset.email.body, {
                contact: primary?.name ?? record.name,
                approver,
              })}
            />
          ) : null}

          {record.nextCheck ? (
            <p className="text-[12px]">
              <span className="text-gray-500">Next check </span>
              <button
                type="button"
                onClick={() => onOpenTask(record.nextCheck!.taskId)}
                className="font-medium text-primary-700 underline-offset-2 hover:underline"
              >
                {shortDate(record.nextCheck.dueAt)}
              </button>
            </p>
          ) : null}

          {record.status !== "declined" ? (
            declining ? (
              <div className="flex gap-2">
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why is this closed?"
                  className="min-w-0 flex-1 rounded-md border border-gray-200 px-2 py-1 text-[12px]"
                />
                <button
                  type="button"
                  disabled={!reason.trim()}
                  onClick={() => void onDecline(reason.trim())}
                  className="rounded-md border border-gray-200 px-2 py-1 text-[12px] disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setDeclining(true)}
                className="text-[11px] text-gray-500 hover:text-gray-700"
              >
                Mark declined
              </button>
            )
          ) : null}

          <History notes={record.notes} onAdd={onNote} />
        </div>
      ) : null}
    </div>
  );
}

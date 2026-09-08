"use client";

import { useState } from "react";
import { CHANNELS } from "@/lib/medjobs/activation";
import { CHANNEL_ASSETS, fillTemplate } from "@/lib/medjobs/activation-tasks";
import StatusDot, { DueDot } from "./StatusDot";
import LiveWinChecklist from "./LiveWinChecklist";
import History from "./History";
import SuccessToast from "./SuccessToast";
import Copyable from "./Copyable";
import RecordCard from "./RecordCard";
import { shortDate, type ActivationChannel } from "./types";

/**
 * One of the five channels, collapsed to a line and expanded to its
 * workflow. Two click targets on the collapsed row: the row expands it,
 * the date leaves for the task.
 */
export default function ChannelCard({
  campusId,
  channel,
  onToggle,
  onNote,
  onDetail,
  onNotAvailable,
  onAddRecord,
  onRecordToggle,
  onRecordNote,
  onRecordDecline,
  onOpenTask,
}: {
  campusId: string;
  channel: ActivationChannel;
  onToggle: (key: string, checked: boolean) => Promise<{ wentLive: boolean } | void>;
  onNote: (text: string) => Promise<void>;
  onDetail: (detail: Record<string, unknown>) => Promise<void>;
  onNotAvailable: (reason: string) => Promise<void>;
  onAddRecord: (name: string) => Promise<void>;
  onRecordToggle: (recordId: string, key: string, checked: boolean) => Promise<{ wentLive: boolean } | void>;
  onRecordNote: (recordId: string, text: string) => Promise<void>;
  onRecordDecline: (recordId: string, reason: string) => Promise<void>;
  onOpenTask: (taskId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [win, setWin] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [marking, setMarking] = useState(false);
  const [reason, setReason] = useState("");

  const def = CHANNELS[channel.channel];
  const asset = CHANNEL_ASSETS[channel.channel];
  const detail = channel.detail as Record<string, string | undefined>;
  // The advisor is the default contact on every channel, so the suggested
  // copy addresses them by name rather than shipping a placeholder.
  const advisorName = (channel.detail as { contacts?: Array<{ name: string }> }).contacts?.[0]?.name ?? null;

  // ST7 keeps its list locked until approval is recorded. The rule is a
  // policy about how we treat a university, not a UI nicety, so it is
  // enforced in the API too.
  const gated = channel.channel === "st7";
  const gateOpen = Boolean(channel.criteria.approved);

  const toggle = async (key: string, checked: boolean) => {
    const res = await onToggle(key, checked);
    if (res && res.wentLive) setWin(true);
  };

  const summary =
    def.records
      ? channel.recordCount === 0
        ? "None added"
        : `${channel.liveCount} of ${channel.recordCount} live`
      : channel.firstActivatedAt
        ? `Activated ${shortDate(channel.firstActivatedAt)}`
        : channel.status === "not_available"
          ? "Not available here"
          : "Not yet activated";

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <StatusDot status={channel.status} />
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            {channel.channel}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-gray-900">
            {channel.name}
          </span>
          <span className="hidden shrink-0 text-[12px] text-gray-500 sm:inline">{summary}</span>
        </button>

        {channel.nextCheck ? (
          <button
            type="button"
            onClick={() => onOpenTask(channel.nextCheck!.taskId)}
            className="flex shrink-0 items-center gap-1 text-[12px] tabular-nums text-primary-700 underline-offset-2 hover:underline"
          >
            {channel.due ? <DueDot /> : null}
            {shortDate(channel.nextCheck.dueAt)}
          </button>
        ) : channel.due ? (
          <DueDot />
        ) : null}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 text-gray-400"
          aria-label={open ? "Collapse" : "Expand"}
        >
          {open ? "▾" : "▸"}
        </button>
      </div>

      {open ? (
        <div className="space-y-3 border-t border-gray-100 px-3 py-3">
          {win ? (
            <SuccessToast
              title={`${channel.name} is live`}
              detail={
                def.cadenceMonths
                  ? `Next check in ${def.cadenceMonths} month${def.cadenceMonths > 1 ? "s" : ""}.`
                  : undefined
              }
              onDone={() => setWin(false)}
            />
          ) : null}

          {channel.status === "not_available" ? (
            <p className="rounded-md bg-gray-50 px-2 py-1.5 text-[12px] text-gray-600">
              Not available here. {channel.statusReason}
            </p>
          ) : null}

          {/* ST7's approval gate sits above everything, because nothing below
              it may happen until it is cleared. */}
          {gated ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-2.5">
              <p className="text-[12px] text-gray-700">
                We do not prospect or email professors until this is cleared.
              </p>
              <div className="mt-2">
                <LiveWinChecklist
                  liveWhen="Approval to use the directory and contact professors directly."
                  rule="all"
                  items={def.criteria}
                  criteria={channel.criteria}
                  onToggle={toggle}
                />
              </div>
              <div className="mt-2 grid grid-cols-[5rem_1fr] gap-x-3 gap-y-1 text-[12px]">
                <span className="text-gray-500">Person</span>
                <span className="text-gray-800">{detail.approver ?? "not recorded"}</span>
                <span className="text-gray-500">Mechanism</span>
                <span className="text-gray-800">{detail.mechanism ?? "not recorded"}</span>
              </div>
            </div>
          ) : def.criteria.length > 0 ? (
            <LiveWinChecklist
              liveWhen={def.liveWhen}
              rule={def.rule}
              items={def.criteria}
              criteria={channel.criteria}
              disabled={channel.status === "not_available"}
              onToggle={toggle}
            />
          ) : (
            <p className="text-[13px] text-gray-700">{def.liveWhen}</p>
          )}

          {channel.channel === "st3" ? (
            <PostingUrl url={detail.posting_url} onSave={(u) => onDetail({ posting_url: u })} />
          ) : null}

          {asset && channel.channel === "st4" ? (
            <>
              <Copyable
                label="Suggested email"
                subject={asset.email.subject}
                body={fillTemplate(asset.email.body, { contact: advisorName })}
              />
              <Copyable label="Call or meeting script" body={fillTemplate(asset.script, { contact: advisorName })} />
            </>
          ) : null}

          {/* The three list channels. */}
          {def.records ? (
            gated && !gateOpen ? (
              <p className="rounded-md border border-dashed border-gray-200 px-3 py-3 text-center text-[12px] text-gray-500">
                Prospecting unlocks when approval is recorded.
              </p>
            ) : (
              <div className="space-y-2">
                {(channel.records ?? []).map((r) => (
                  <RecordCard
                    key={r.id}
                    record={r}
                    channel={channel.channel}
                    approver={detail.approver}
                    onToggle={(k, c) => onRecordToggle(r.id, k, c)}
                    onNote={(t) => onRecordNote(r.id, t)}
                    onDecline={(reason) => onRecordDecline(r.id, reason)}
                    onOpenTask={onOpenTask}
                  />
                ))}

                {adding ? (
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newName.trim()) {
                          void onAddRecord(newName.trim()).then(() => {
                            setNewName("");
                            setAdding(false);
                          });
                        }
                        if (e.key === "Escape") setAdding(false);
                      }}
                      placeholder={
                        def.records === "organization"
                          ? "Organization name"
                          : def.records === "event"
                            ? "Event or webinar name"
                            : "Professor name"
                      }
                      className="min-w-0 flex-1 rounded-md border border-gray-200 px-2 py-1 text-[12px] focus:border-primary-400 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setAdding(false)}
                      className="rounded-md border border-gray-200 px-2 py-1 text-[12px] text-gray-600"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAdding(true)}
                    className="w-full rounded-md border border-dashed border-gray-200 py-1.5 text-[12px] font-medium text-primary-700 hover:bg-primary-50"
                  >
                    + Add {def.records === "organization" ? "organization" : def.records === "event" ? "event" : "professor"}
                  </button>
                )}
              </div>
            )
          ) : null}

          {channel.status !== "not_available" ? (
            marking ? (
              <div className="flex gap-2">
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why is this not available here?"
                  className="min-w-0 flex-1 rounded-md border border-gray-200 px-2 py-1 text-[12px]"
                />
                <button
                  type="button"
                  disabled={!reason.trim()}
                  onClick={() => void onNotAvailable(reason.trim())}
                  className="rounded-md border border-gray-200 px-2 py-1 text-[12px] disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setMarking(true)}
                className="text-[11px] text-gray-500 hover:text-gray-700"
              >
                Mark not available here
              </button>
            )
          ) : null}

          <History notes={channel.notes} onAdd={onNote} />
        </div>
      ) : null}
    </div>
  );
}

/** ST3 cannot confirm a posting is visible without saying where it is. */
function PostingUrl({ url, onSave }: { url?: string; onSave: (u: string) => Promise<void> }) {
  const [value, setValue] = useState(url ?? "");
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <p className="text-[12px]">
        <span className="text-gray-500">Posting </span>
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary-700 hover:underline">
            {url}
          </a>
        ) : (
          <span className="text-gray-400">not recorded</span>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="ml-2 text-[11px] text-gray-500 hover:text-gray-700"
        >
          Edit
        </button>
      </p>
    );
  }

  return (
    <div className="flex gap-2">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="https://..."
        className="min-w-0 flex-1 rounded-md border border-gray-200 px-2 py-1 text-[12px]"
      />
      <button
        type="button"
        onClick={() => void onSave(value.trim()).then(() => setEditing(false))}
        className="rounded-md bg-primary-600 px-2 py-1 text-[12px] font-medium text-white hover:bg-primary-700"
      >
        Save
      </button>
    </div>
  );
}

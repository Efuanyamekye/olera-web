"use client";

/**
 * CustomCadenceModal — the admin-composed cadence builder, opened from the reply
 * outcome modal ("Launch custom cadence"). Mirrors CadenceLaunchModal's shell so
 * it reads as a sibling of the outreach/activation launch screens (no design
 * drift). Each step is a day + a type (email/call) + its fields. Emails become a
 * bespoke Smartlead campaign; calls become CRM call reminders.
 */

import { useEffect, useState } from "react";

interface StepDraft {
  id: string;
  type: "email" | "call";
  day: number;
  subject: string;
  body: string;
  script: string;
}

export interface CustomCadenceSubmit {
  name: string;
  steps: Array<{ type: "email" | "call"; day: number; subject?: string; body?: string; script?: string }>;
}

interface Props {
  recipientName?: string | null;
  recipientEmail?: string | null;
  onCancel: () => void;
  onSubmit: (payload: CustomCadenceSubmit) => Promise<void>;
}

let stepSeq = 0;
const newStep = (type: "email" | "call", day: number): StepDraft => ({
  id: `s${++stepSeq}`,
  type,
  day,
  subject: "",
  body: "",
  script: "",
});

function nextDay(steps: StepDraft[]): number {
  if (steps.length === 0) return 0;
  return Math.max(...steps.map((s) => s.day)) + 2;
}

export function CustomCadenceModal({ recipientName, recipientEmail, onCancel, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<StepDraft[]>(() => [newStep("email", 0)]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const update = (id: string, patch: Partial<StepDraft>) =>
    setSteps((cur) => cur.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const remove = (id: string) => setSteps((cur) => cur.filter((s) => s.id !== id));
  const addEmail = () => setSteps((cur) => [...cur, newStep("email", nextDay(cur))]);
  const addCall = () => setSteps((cur) => [...cur, newStep("call", nextDay(cur))]);

  const invalid =
    steps.length === 0 ||
    steps.some(
      (s) =>
        s.day < 0 ||
        (s.type === "email" && (!s.subject.trim() || !s.body.trim())) ||
        (s.type === "call" && !s.script.trim()),
    );

  const submit = async () => {
    if (invalid) {
      setErr("Fill in every step — emails need a subject + body, calls need a note — and use day 0 or higher.");
      return;
    }
    setErr(null);
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim() || "Custom cadence",
        steps: [...steps]
          .sort((a, b) => a.day - b.day)
          .map((s) =>
            s.type === "email"
              ? { type: "email" as const, day: s.day, subject: s.subject.trim(), body: s.body.trim() }
              : { type: "call" as const, day: s.day, script: s.script.trim() },
          ),
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Launch failed");
    } finally {
      setSubmitting(false);
    }
  };

  const emailCount = steps.filter((s) => s.type === "email").length;
  const callCount = steps.filter((s) => s.type === "call").length;
  const sorted = [...steps].sort((a, b) => a.day - b.day);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Build a custom cadence</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Compose your own emails + calls. Emails send from Smartlead on their day; calls land in the Calls
              tab. Stops automatically when they reply.
            </p>
          </div>
          <button onClick={onCancel} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100" aria-label="Close">
            <span aria-hidden>×</span>
          </button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
          {err && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

          {(recipientName || recipientEmail) && (
            <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-700">
              Sends to <strong>{recipientName || recipientEmail}</strong>
              {recipientName && recipientEmail ? <span className="text-gray-500"> ({recipientEmail})</span> : null}
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">Cadence name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Re: pricing question"
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none"
            />
          </label>

          {sorted.map((s) => (
            <div key={s.id} className="rounded-md border border-gray-200 bg-white p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">
                  {s.type === "email" ? "✉ Email" : "☎ Call"}
                </span>
                <span className="text-xs text-gray-400">·</span>
                <label className="flex items-center gap-1 text-xs text-gray-600">
                  Day
                  <input
                    type="number"
                    min={0}
                    value={s.day}
                    onChange={(e) => update(s.id, { day: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                    className="w-16 rounded-md border border-gray-200 px-2 py-1 text-sm focus:border-gray-400 focus:outline-none"
                  />
                </label>
                <button onClick={() => remove(s.id)} className="ml-auto text-xs text-gray-400 hover:text-red-600">
                  ✕ Remove
                </button>
              </div>
              {s.type === "email" ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={s.subject}
                    onChange={(e) => update(s.id, { subject: e.target.value })}
                    placeholder="Subject"
                    className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none"
                  />
                  <textarea
                    value={s.body}
                    onChange={(e) => update(s.id, { body: e.target.value })}
                    placeholder="Write your message… (your signature is added automatically)"
                    rows={4}
                    className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none"
                  />
                </div>
              ) : (
                <textarea
                  value={s.script}
                  onChange={(e) => update(s.id, { script: e.target.value })}
                  placeholder="Call note / script"
                  rows={2}
                  className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none"
                />
              )}
            </div>
          ))}

          <div className="flex gap-2">
            <button
              onClick={addEmail}
              className="rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              + Add email
            </button>
            <button
              onClick={addCall}
              className="rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              + Add call
            </button>
          </div>
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-gray-100 bg-gray-50 px-6 py-3">
          <p className="text-xs text-gray-500">
            {emailCount} email{emailCount === 1 ? "" : "s"}
            {callCount > 0 ? ` · ${callCount} call${callCount === 1 ? "" : "s"}` : ""}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              disabled={submitting}
              className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={submit}
              disabled={submitting || invalid}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {submitting ? "Launching…" : "Launch cadence"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { FAMILY_TOUCH_CHANNELS, type FamilyTouchChannel } from "@/lib/seeker-touches/types";

/**
 * Log what happened with a family.
 *
 * TJ's rule from the provider build, after the seven-field version of this:
 * "way too manual and I'll quickly fall behind and probably not use this as it
 * should be. More simple, fewer touches, automatic when possible is best."
 *
 * So: one box. You type what happened and press Log. Channel is inferred from
 * the words, time defaults to now, direction defaults to outbound. The only
 * other control is the one thing nothing can infer and everything depends on —
 * whether you actually got hold of them. Calling someone and speaking to them
 * are different events, and only the second clears an owed call.
 */

const CHANNEL_GUESS: { channel: FamilyTouchChannel; words: RegExp }[] = [
  { channel: "call", words: /\b(call(ed|ing)?|phone[d]?|voicemail|vm|rang|dial(led|ed)?)\b/i },
  { channel: "text", words: /\b(text(ed)?|sms|messaged|whatsapp)\b/i },
  { channel: "email", words: /\b(email(ed)?|wrote to|replied to|inbox)\b/i },
  { channel: "meeting", words: /\b(met|meeting|zoom|visit(ed)?|in person)\b/i },
];

/** Cheap and revisable: the box is the record, this only picks an icon's worth. */
export function guessChannel(text: string): FamilyTouchChannel {
  for (const g of CHANNEL_GUESS) if (g.words.test(text)) return g.channel;
  return "note";
}

/** "they called us", "she emailed" — a touch that came the other way. */
function guessInbound(text: string): boolean {
  return /\b(they|she|he|her|his|family)\s+(called|texted|emailed|wrote|replied|got back)/i.test(text);
}

type Props = {
  seekerId: string;
  /** Shown as the default when we know it, so a spoken-to call is one click. */
  onLogged: () => void;
};

export default function LogFamilyTouch({ seekerId, onLogged }: Props) {
  const [text, setText] = useState("");
  const [reached, setReached] = useState<boolean | null>(null);
  const [nextAction, setNextAction] = useState("");
  const [due, setDue] = useState("");
  const [showNext, setShowNext] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const channel = guessChannel(text);
  const canSave = text.trim().length > 0 && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/seeker-touches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seeker_id: seekerId,
          channel,
          direction: guessInbound(text) ? "in" : "out",
          summary: text.trim().slice(0, 240),
          detail: text.trim().length > 240 ? text.trim() : null,
          reached,
          next_action: nextAction.trim() || null,
          next_action_due: due || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Could not save that");
      setText("");
      setReached(null);
      setNextAction("");
      setDue("");
      setShowNext(false);
      onLogged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-baseline justify-between">
        <p className="font-mono text-[9.5px] uppercase tracking-[0.11em] text-gray-500">Log what happened</p>
        {text.trim() && (
          <span className="font-mono text-[10.5px] text-gray-400">
            filing as {channel}
            {guessInbound(text) ? ", from them" : ""}
          </span>
        )}
      </div>

      <textarea
        id="family-touch-summary"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") save();
        }}
        rows={2}
        placeholder="Called, mailbox full, texted instead"
        className="mt-2 w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-[15px] text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
      />

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-gray-500">Did you get hold of them?</span>
        {(
          [
            [true, "Yes, spoke to them"],
            [false, "No, didn't reach them"],
            [null, "Not applicable"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={String(v)}
            type="button"
            onClick={() => setReached(v)}
            className={`rounded-full border px-2.5 py-1 text-[12px] font-medium ${
              reached === v
                ? v === true
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : v === false
                    ? "border-red-600 bg-red-600 text-white"
                    : "border-gray-900 bg-gray-900 text-white"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {showNext ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <input
            id="family-touch-next"
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
            placeholder="What happens next"
            className="min-w-[220px] flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-[14px] text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
          />
          <input
            id="family-touch-due"
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="rounded-lg border border-gray-200 px-2 py-1.5 font-mono text-[12px] text-gray-700 focus:border-gray-400 focus:outline-none"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowNext(true)}
          className="mt-2.5 text-[12px] font-medium text-teal-700 hover:underline"
        >
          + Set what happens next
        </button>
      )}

      {error && <p className="mt-2 text-[13px] text-red-600">{error}</p>}

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className="rounded-md bg-gray-900 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {saving ? "Logging…" : "Log it"}
        </button>
        <span className="font-mono text-[10.5px] text-gray-400">⌘↵ to log · time defaults to now</span>
      </div>
    </div>
  );
}

export { FAMILY_TOUCH_CHANNELS };

"use client";

import { useState } from "react";

/**
 * The city-lead controls that used to live only on the City campaigns lead
 * card, so a family is worked in one place: here, on their page.
 *
 *   - Hand to the provider whose own ad found them
 *   - Offers: "they said yes by phone" and "skip" on an open offer
 *   - Once a provider has them: Reached · Became a client · Not a fit · Unreachable
 *   - Text or email the family, now or in their morning, and cancel a scheduled one
 *   - A private note
 *
 * Every button posts to /api/admin/city-ads, the same actions that page used,
 * so there is still one code path for all of it.
 */

export interface CityLeadToolsData {
  lead_id: string;
  status: string;
  closed: boolean;
  offers: { id: string; provider_id?: string; provider_name: string; offered_at: string; state: "open" | "accepted" | "declined" | "expired" }[];
  has_provider: boolean;
  handed_at: string | null;
  campaign_owner: string | null;
  campaign_provider_id?: string | null;
  can_hand: boolean;
  admin_note: string | null;
  has_phone: boolean;
  has_email: boolean;
  pending_messages: { id: string; channel: string; subject: string | null; body: string; send_after: string }[];
}

const label = "font-mono text-[9.5px] uppercase tracking-[0.11em] text-gray-500";
const btn = "rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50";
const btnPri = "rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50";

const OFFER_WORD: Record<string, string> = { open: "waiting on them", accepted: "took it", declined: "passed", expired: "didn't answer" };

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}

export default function CityLeadTools({ data, onChanged }: { data: CityLeadToolsData; onChanged: () => void | Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [channel, setChannel] = useState<"sms" | "email">(data.has_phone ? "sms" : "email");
  const [text, setText] = useState("");
  const [subject, setSubject] = useState("");
  const [note, setNote] = useState(data.admin_note ?? "");

  async function act(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/city-ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setMsg({ tone: "ok", text: d.message || done });
      await onChanged();
      return true;
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : "Did not save" });
      return false;
    } finally {
      setBusy(false);
    }
  }

  const openOffers = data.offers.filter((o) => o.state === "open");
  const id = data.lead_id;

  return (
    <div className="mt-4 rounded-lg border border-gray-200 bg-white px-4 py-3">
      <p className={label}>City lead</p>

      {data.handed_at && (
        <p className="mt-1.5 text-sm text-gray-800">
          With {data.campaign_owner ?? "the provider whose ad found them"} since {when(data.handed_at)}. They see every text you send and every call you log.
        </p>
      )}
      {data.can_hand && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy} className={btn} onClick={() => void act({ action: "hand_to_primary", leadId: id }, "Handed over.")}>
            Hand to {data.campaign_owner}
          </button>
          <span className="text-[12px] text-gray-500">Their own ad found this family. It goes on their campaign page now.</span>
        </div>
      )}

      {data.offers.length > 0 && (
        <ul className="mt-2.5 space-y-1.5">
          {data.offers.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="text-gray-800">{o.provider_name}</span>
              <span className="font-mono text-[11px] text-gray-400">{when(o.offered_at)}</span>
              <span className="font-mono text-[10px] text-gray-500">{OFFER_WORD[o.state]}</span>
              {o.state === "open" && (
                <>
                  <button type="button" disabled={busy} className={btn} onClick={() => void act({ action: "accept", offerId: o.id }, "Marked as taken.")}>
                    They said yes by phone
                  </button>
                  <button type="button" disabled={busy} className={btn} onClick={() => void act({ action: "decline", offerId: o.id }, "Skipped.")}>
                    Skip
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {openOffers.length === 0 && data.offers.length > 0 && !data.has_provider && !data.closed && (
        <p className="mt-1 text-[12px] text-gray-500">No offer is open. Use Where this goes to offer it again.</p>
      )}

      {data.has_provider && !data.closed && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <p className={label}>How it went with the provider</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {data.status !== "contacted" && (
              <button type="button" disabled={busy} className={btn} onClick={() => void act({ action: "set_status", leadId: id, status: "contacted" }, "Marked as reached.")}>
                Reached
              </button>
            )}
            <button type="button" disabled={busy} className={btn} onClick={() => void act({ action: "set_status", leadId: id, status: "client" }, "Marked as a client.")}>
              Became a client
            </button>
            <button type="button" disabled={busy} className={btn} onClick={() => void act({ action: "set_status", leadId: id, status: "no_fit" }, "Marked not a fit.")}>
              Not a fit
            </button>
            <button type="button" disabled={busy} className={btn} onClick={() => void act({ action: "set_status", leadId: id, status: "unreachable" }, "Marked unreachable.")}>
              Unreachable
            </button>
          </div>
        </div>
      )}

      {!data.closed && (data.has_phone || data.has_email) && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={`msg-${id}`} className={label}>
              Message the family
            </label>
            <select
              aria-label="Channel"
              value={channel}
              onChange={(e) => setChannel(e.target.value as "sms" | "email")}
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700"
            >
              {data.has_phone && <option value="sms">Text</option>}
              {data.has_email && <option value="email">Email</option>}
            </select>
          </div>
          {channel === "email" && (
            <input
              aria-label="Email subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="mt-1.5 w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-900"
            />
          )}
          <textarea
            id={`msg-${id}`}
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={channel === "sms" ? 480 : 10000}
            placeholder={channel === "sms" ? "Keep it short. The provider sees it too." : "The provider sees this too."}
            className="mt-1.5 w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm text-gray-900"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !text.trim() || (channel === "email" && !subject.trim())}
              className={btnPri}
              onClick={async () => {
                if (await act({ action: "message_family", leadId: id, channel, message: text, subject }, "Sent.")) {
                  setText("");
                  setSubject("");
                }
              }}
            >
              Send now
            </button>
            <button
              type="button"
              disabled={busy || !text.trim() || (channel === "email" && !subject.trim())}
              className={btn}
              onClick={async () => {
                if (await act({ action: "message_family", leadId: id, channel, message: text, subject, schedule: true }, "Scheduled for their morning.")) {
                  setText("");
                  setSubject("");
                }
              }}
            >
              Send in their morning
            </button>
          </div>
          {data.pending_messages.length > 0 && (
            <ul className="mt-2 space-y-1">
              {data.pending_messages.map((m) => (
                <li key={m.id} className="flex flex-wrap items-baseline gap-2 text-[13px] text-gray-600">
                  <span className="font-mono text-[10px] text-gray-400">
                    {m.channel === "sms" ? "text" : "email"} · {when(m.send_after)}
                  </span>
                  <span className="min-w-0 truncate">{m.subject ?? m.body}</span>
                  <button type="button" disabled={busy} className="text-xs text-red-700 hover:underline" onClick={() => void act({ action: "cancel_message", leadId: id, messageId: m.id }, "Canceled.")}>
                    Cancel
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-3 border-t border-gray-100 pt-3">
        <label htmlFor={`note-${id}`} className={label}>
          Private note
        </label>
        <textarea
          id={`note-${id}`}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Only our team sees this."
          className="mt-1.5 w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm text-gray-900"
        />
        {note !== (data.admin_note ?? "") && (
          <button type="button" disabled={busy} className={`${btn} mt-1.5`} onClick={() => void act({ action: "note", leadId: id, note }, "Note saved.")}>
            Save note
          </button>
        )}
      </div>

      {msg && <p className={`mt-2 text-[13px] ${msg.tone === "ok" ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p>}
    </div>
  );
}

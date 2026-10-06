"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import TouchForm from "@/components/admin/TouchForm";
import TeamMembers from "@/components/admin/TeamMembers";
import { CHANNEL_LABEL, type ProviderTimeline, type TimelineItem } from "@/lib/touches/types";

/**
 * One provider. Everything, in order.
 *
 * Three sources on one line: what we did, what they did, what the system did. The
 * right-hand tag says where each row came from, which is the difference between a
 * log you trust and one you do not.
 */

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}
function monthOf(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "America/New_York" });
}
function fmtDue(due: string | null): string {
  if (!due) return "";
  const [y, m, d] = due.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

const DOT: Record<TimelineItem["actor"], string> = {
  out: "bg-gray-900",
  in: "bg-sky-600",
  system: "border border-gray-400 bg-transparent",
};

export default function AdminRelationshipPage() {
  const params = useParams<{ providerId: string }>();
  const providerId = params.providerId;
  const [data, setData] = useState<ProviderTimeline | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/touches?provider=${encodeURIComponent(providerId)}`);
      if (!res.ok) throw new Error("Failed to load");
      setData(await res.json());
    } catch {
      setError("Failed to load this provider.");
    }
  }, [providerId]);

  useEffect(() => {
    load();
  }, [load]);

  async function markDone() {
    if (!data?.open_action) return;
    setMarking(true);
    try {
      const res = await fetch("/api/admin/touches", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: data.open_action.touch_id, done: true }),
      });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      setError("Could not mark the next action done.");
    } finally {
      setMarking(false);
    }
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }
  if (!data) {
    return <div className="mx-auto max-w-4xl px-4 py-8 text-sm text-gray-400">Loading…</div>;
  }

  const p = data.profile;
  const overdue = data.flags.includes("overdue");

  // Group by month for the eye; order stays newest first.
  const groups: { month: string; items: TimelineItem[] }[] = [];
  for (const it of data.items) {
    const m = monthOf(it.occurred_at);
    const g = groups[groups.length - 1];
    if (g && g.month === m) g.items.push(it);
    else groups.push({ month: m, items: [it] });
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <div className="mb-3 font-mono text-[11px] text-gray-500">
        <Link href="/admin/relationships" className="hover:underline">
          Provider Relationships
        </Link>{" "}
        / {p.display_name}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="grid gap-4 border-b border-gray-200 p-4 sm:grid-cols-[1fr_300px]">
          <div>
            <h1 className="text-lg font-semibold text-gray-950">
              {p.display_name}
              {p.contact_name ? <span className="font-normal text-gray-500"> · {p.contact_name}</span> : null}
            </h1>
            <div className="mt-1 font-mono text-[11.5px] leading-relaxed text-gray-500">
              {[p.city, p.state].filter(Boolean).join(", ")}
              {p.email ? ` · ${p.email}` : ""}
              {p.claimer_email ? ` · ${p.claimer_email}` : ""}
              {p.phone ? ` · ${p.phone}` : ""}
              {p.preferred_channel === "sms" ? " · prefers text" : ""}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {data.flags.map((f) => (
                <span key={f} className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-600">
                  {f.replace(/_/g, " ")}
                </span>
              ))}
              {data.campaigns.map((c, i) => (
                <Link key={c.id} href={`/admin/ad-boost/${c.id}`} className="font-mono text-[10px] text-teal-700 hover:underline">
                  {data.campaigns.length > 1 ? `campaign ${data.campaigns.length - i}` : "campaign"} · {c.status.replace(/_/g, " ")} →
                </Link>
              ))}
              <Link href={`/admin/directory/${p.provider_id}`} className="font-mono text-[10px] text-teal-700 hover:underline">
                directory record →
              </Link>
              <a href={`/api/admin/touches?provider=${p.provider_id}&format=md`} target="_blank" rel="noreferrer" className="font-mono text-[10px] text-teal-700 hover:underline">
                read as text →
              </a>
            </div>
          </div>
          <div className={`border-l-[3px] px-4 py-3 ${overdue ? "border-orange-500 bg-orange-50" : "border-teal-600 bg-teal-50/60"}`}>
            <p className={`text-[10px] font-semibold uppercase tracking-[0.08em] ${overdue ? "text-orange-800" : "text-teal-800"}`}>
              Next action{overdue ? " · overdue" : ""}
            </p>
            {data.open_action ? (
              <>
                <p className="mt-1 text-sm font-semibold text-gray-900">{data.open_action.text}</p>
                <p className="mt-0.5 font-mono text-[11px] text-gray-600">
                  {data.open_action.due ? `due ${fmtDue(data.open_action.due)}` : "no date"}
                  {data.open_action.owner ? ` · ${data.open_action.owner}` : ""}
                </p>
                <button
                  type="button"
                  onClick={markDone}
                  disabled={marking}
                  className="mt-2 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {marking ? "Marking…" : "Mark done"}
                </button>
              </>
            ) : (
              <p className="mt-1 text-sm text-gray-500">None declared. Log a touch and say what happens next.</p>
            )}
          </div>
        </div>

        <TeamMembers providerId={p.provider_id} />

        <div className="border-b border-gray-200 px-4 py-3">
          {showForm ? (
            <TouchForm
              providerId={p.provider_id}
              onSaved={() => {
                setShowForm(false);
                load();
              }}
              onCancel={() => setShowForm(false)}
            />
          ) : (
            <button type="button" onClick={() => setShowForm(true)} className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-gray-800">
              Log a touch
            </button>
          )}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>

        <div className="px-4 pb-4">
          {data.items.length === 0 && <p className="py-6 text-sm text-gray-400">Nothing on record yet.</p>}
          {groups.map((g) => (
            <div key={g.month}>
              <div className="pb-1 pt-4 font-mono text-[10px] uppercase tracking-[0.1em] text-gray-400">{g.month}</div>
              {g.items.map((it) => (
                <div key={it.id} className="grid grid-cols-[130px_18px_1fr_auto] items-start gap-x-3 border-b border-gray-100 py-2.5 last:border-b-0">
                  <div className="pt-0.5 font-mono text-[11px] text-gray-500">{fmtWhen(it.occurred_at)}</div>
                  <div className="pt-1.5">
                    <div className={`mx-auto h-2.5 w-2.5 rounded-full ${DOT[it.actor]}`} />
                  </div>
                  <div className="min-w-0">
                    <div className={`${it.actor === "system" ? "text-gray-600" : "font-semibold text-gray-900"}`}>
                      {it.actor !== "system" && (
                        <span className="mr-1.5 rounded border border-gray-200 px-1.5 py-0.5 align-middle font-mono text-[10px] font-normal text-gray-600">
                          {CHANNEL_LABEL[it.channel as keyof typeof CHANNEL_LABEL] ?? it.channel} · {it.actor === "out" ? "us" : "them"}
                        </span>
                      )}
                      {it.title}
                    </div>
                    {it.detail && <div className="mt-0.5 text-sm text-gray-600">{it.detail}</div>}
                    {it.contact_handle && it.actor !== "system" && <div className="mt-0.5 font-mono text-[11px] text-gray-400">{it.contact_handle}</div>}
                    {it.next_action && (
                      <div className={`mt-1 font-mono text-[11px] ${it.next_action.done_at ? "text-gray-400 line-through" : "text-teal-800"}`}>
                        → {it.next_action.text}
                        {it.next_action.due ? ` · due ${fmtDue(it.next_action.due)}` : ""}
                        {it.next_action.owner ? ` · ${it.next_action.owner}` : ""}
                      </div>
                    )}
                  </div>
                  <div className="pt-0.5 text-right">
                    <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${it.status === "needs reply" ? "bg-rose-50 text-rose-800" : it.source === "system" ? "bg-gray-100 text-gray-500" : it.status === "failed" || it.status === "complained" || it.status === "bounced" ? "bg-red-50 text-red-700" : "border border-gray-200 text-gray-600"}`}>
                      {it.source}
                      {it.status ? ` · ${it.status}` : ""}
                    </span>
                    {it.href && (
                      <div className="mt-1">
                        <Link href={it.href} className="font-mono text-[10px] text-teal-800 hover:underline">
                          open inbox →
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <p className="mt-3 max-w-3xl text-xs text-gray-500">
        Black dot: we did it. Blue: they did. Hollow: the system did. <span className="font-mono">gmail</span> rows came from a mailbox: support@ threads (their replies, and copies of emails we Bcc'd), or an email logged from Gmail. <span className="font-mono">twilio</span> rows are texts to the Olera number, <span className="font-mono">manual</span> rows were typed or pasted, <span className="font-mono">system</span> rows come from email_log and the campaign case log. Nothing here is stored as a status; it is all read off the rows.
      </p>
    </div>
  );
}

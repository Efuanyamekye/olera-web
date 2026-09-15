"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { EPISODE_WORD } from "@/lib/seeker-touches/present";
import LogFamilyTouch from "@/components/admin/LogFamilyTouch";
import {
  SEEKER_FLAG_LABEL,
  type SeekerFlag,
  type SeekerRelationship,
  type SeekerTimelineItem,
} from "@/lib/seeker-touches/types";

/**
 * One family, every channel.
 *
 * Six facts across the top, then everything that has happened in order. Each row
 * says which table it came from, so a timeline you trust is one where every line
 * says how it knows — the same rule as the provider timeline.
 */

const FLAG_STYLE: Record<SeekerFlag, string> = {
  awaiting_reply: "bg-rose-50 text-rose-800",
  unreachable: "bg-red-50 text-red-700",
  opted_out: "bg-gray-100 text-gray-600",
  provider_silent: "bg-amber-50 text-amber-800",
  outcome_reported: "bg-emerald-50 text-emerald-800",
  never_human: "bg-gray-100 text-gray-600",
  no_name: "bg-gray-100 text-gray-500",
  promise_owed: "bg-orange-50 text-orange-800",
};

const KIND_LABEL: Record<SeekerTimelineItem["kind"], string> = {
  touch: "touch",
  email: "system",
  support: "support@",
  sms: "text in",
  inquiry: "inquiry",
  city: "city",
  activity: "on site",
};

const KIND_STYLE: Record<SeekerTimelineItem["kind"], string> = {
  touch: "bg-sky-50 text-sky-800",
  email: "bg-gray-100 text-gray-500",
  support: "bg-emerald-50 text-emerald-800",
  sms: "bg-emerald-50 text-emerald-800",
  inquiry: "bg-violet-50 text-violet-800",
  city: "bg-teal-50 text-teal-800",
  activity: "bg-gray-100 text-gray-500",
};

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

function Fact({ label, value, note, tone }: { label: string; value: string; note?: string | null; tone?: string }) {
  return (
    <div className="bg-white px-3.5 py-2.5">
      <p className="font-mono text-[9.5px] uppercase tracking-[0.11em] text-gray-500">{label}</p>
      <p className={`mt-0.5 text-sm font-medium ${tone ?? "text-gray-900"}`}>{value}</p>
      {note && <p className="mt-0.5 font-mono text-[10.5px] text-gray-500">{note}</p>}
    </div>
  );
}

export default function AdminSeekerTimelinePage() {
  const { seekerId } = useParams<{ seekerId: string }>();
  const [data, setData] = useState<SeekerRelationship | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/seeker-touches?seeker=${seekerId}`);
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json());
    } catch {
      setError("Failed to load this family. Reload to try again.");
    }
  }, [seekerId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <p className="text-sm text-red-600">{error}</p>
        <Link href="/admin/relationships/families" className="mt-3 inline-block text-sm text-teal-700 hover:underline">
          ← Back to care seekers
        </Link>
      </div>
    );
  }

  if (!data) {
    return <div className="mx-auto max-w-4xl px-4 py-10 text-sm text-gray-400">Loading…</div>;
  }

  const { profile, reach, consent, episode, flags, providers, items, open_action: openAction } = data;

  async function markActionDone(id: string) {
    setActionError(null);
    try {
      const res = await fetch("/api/admin/seeker-touches", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, done: true }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? "Could not mark that done");
      load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not mark that done");
    }
  }

  const consentLine =
    consent === "opted_out"
      ? { v: "Opted out", n: "no channel is open", tone: "text-red-700" }
      : consent === "olera_only"
        ? { v: "Olera only", n: "concierge city — no handoff without a spoken yes", tone: "text-amber-800" }
        : consent === "provider_ok"
          ? { v: "Providers OK", n: "they asked to be contacted", tone: "text-gray-900" }
          : { v: "No record", n: "treat as Olera only", tone: "text-gray-500" };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <Link href="/admin/relationships/families" className="text-xs text-teal-700 hover:underline">
        ← Care seekers
      </Link>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-gray-200 pb-4">
        <h1
          className={`text-2xl ${profile.label_is_fallback ? "font-normal text-gray-600" : "font-semibold text-gray-950"}`}
        >
          {profile.label}
        </h1>
        <span className="font-mono text-[13px] text-gray-600">
          {[profile.phone, profile.email].filter(Boolean).join(" · ") || "no contact details"}
        </span>
        <div className="ml-auto flex flex-wrap gap-1">
          {flags.map((f) => (
            <span key={f} className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${FLAG_STYLE[f]}`}>
              {SEEKER_FLAG_LABEL[f]}
            </span>
          ))}
        </div>
      </div>

      {profile.situation && (
        <p className="mt-4 max-w-2xl border-l-2 border-gray-200 pl-3 text-[15px] italic leading-relaxed text-gray-700">
          “{profile.situation}”
        </p>
      )}

      <div className="mt-4 grid gap-px overflow-hidden rounded-lg border border-gray-200 bg-gray-200 sm:grid-cols-2 lg:grid-cols-4">
        <Fact
          label="Reachable by"
          value={reach.open.length ? reach.open.join(" + ") : "Nothing"}
          note={reach.note}
          tone={reach.open.length === 0 ? "text-red-700" : reach.note ? "text-amber-800" : "text-gray-900"}
        />
        <Fact label="Consent" value={consentLine.v} note={consentLine.n} tone={consentLine.tone} />
        <Fact
          label="Where it stands"
          value={episode.state === "waiting" ? `${episode.blocked_on} has it` : EPISODE_WORD[episode.state]}
          note={episode.closed_reason ?? (episode.age_days !== null ? `day ${episode.age_days + 1}` : null)}
        />
        <Fact
          label="Timeline they gave"
          value={profile.timeline ? profile.timeline.replace(/_/g, " ") : "not stated"}
          note={profile.payment.length ? profile.payment.join(", ") : null}
        />
      </div>

      {providers.length > 0 && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white px-4 py-3">
          <p className="font-mono text-[9.5px] uppercase tracking-[0.11em] text-gray-500">Providers holding a request</p>
          <ul className="mt-2 space-y-1">
            {providers.map((p) => (
              <li key={`${p.id}-${p.at}`} className="text-sm text-gray-800">
                {p.name}{" "}
                <span className={`font-mono text-[11px] ${p.responded ? "text-emerald-700" : "text-amber-800"}`}>
                  · {p.responded ? "replied" : "no reply"} · sent {fmt(p.at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {openAction && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[9.5px] uppercase tracking-[0.11em] text-amber-700">What happens next</p>
            <p className="mt-0.5 text-[15px] text-gray-900">{openAction.text}</p>
            <p className="mt-0.5 font-mono text-[11px] text-amber-800">
              {openAction.due ? `due ${openAction.due}` : "no date"}
              {openAction.owner ? ` · ${openAction.owner}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => markActionDone(openAction.touch_id)}
            className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
          >
            Mark done
          </button>
          {actionError && <p className="w-full text-[13px] text-red-700">{actionError}</p>}
        </div>
      )}

      <div className="mt-4">
        <LogFamilyTouch seekerId={seekerId} onLogged={load} />
      </div>

      <h2 className="mt-7 font-mono text-[10px] uppercase tracking-[0.13em] text-gray-500">
        Everything, in order · {items.length} events
      </h2>

      <ol className="mt-2 border-l-2 border-gray-200">
        {items.length === 0 && <li className="py-6 pl-4 text-sm text-gray-400">Nothing on record.</li>}
        {items.map((it) => {
          const who = it.actor === "out" ? "You" : it.actor === "in" ? "Them" : "System";
          const bad = !!it.status && /fail|bounce|complain/i.test(it.status);
          const needs = it.status === "needs reply";
          return (
            <li key={it.id} className="relative grid gap-x-3 border-b border-gray-100 py-3 pl-4 last:border-b-0 sm:grid-cols-[110px_74px_1fr]">
              <span
                className={`absolute -left-[5px] top-[19px] h-2 w-2 rounded-full ${
                  bad ? "bg-red-500" : it.actor === "in" ? "bg-emerald-500" : it.actor === "out" ? "bg-sky-600" : "bg-gray-300"
                }`}
                aria-hidden="true"
              />
              <span className="font-mono text-[11px] leading-5 text-gray-500">{fmt(it.occurred_at)}</span>
              <span
                className={`h-fit w-fit rounded px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wide ${KIND_STYLE[it.kind]}`}
              >
                {KIND_LABEL[it.kind]}
              </span>
              <div className="min-w-0">
                <p className="text-[14.5px] leading-snug text-gray-900">
                  <span className="font-semibold">{who}:</span> {it.title}
                </p>
                {it.detail && <p className="mt-1 text-[13.5px] leading-snug text-gray-600">{it.detail}</p>}
                {it.status && (
                  <p
                    className={`mt-1 font-mono text-[11px] ${bad ? "text-red-700" : needs ? "text-rose-700" : "text-gray-500"}`}
                  >
                    {it.status}
                    {it.href && (
                      <>
                        {" · "}
                        <Link href={it.href} className="text-teal-700 hover:underline">
                          open →
                        </Link>
                      </>
                    )}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <p className="mt-6 max-w-3xl font-mono text-[11px] leading-relaxed text-gray-400">
        Assembled at read time from seven sources. Only what you log by hand is stored here; everything else is
        derived from what already happened.
      </p>
    </div>
  );
}

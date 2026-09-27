"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ORIGIN_LABEL, EPISODE_WORD } from "@/lib/seeker-touches/present";
import type { PlanStep, RoutingPlan } from "@/lib/city-ads/plan.server";
import LogFamilyTouch from "@/components/admin/LogFamilyTouch";
import type { CityLeadToolsData } from "@/components/admin/CityLeadTools";
import { TABS, matches, type Tab } from "@/lib/seeker-touches/queues";
import {
  SEEKER_FLAG_LABEL,
  type SeekerFlag,
  type SeekerRelationship,
  type SeekerRelationshipRow,
  type SeekerTimelineItem,
} from "@/lib/seeker-touches/types";

/**
 * One family, one case.
 *
 * Laid out like a messages page: the families still waiting on us on the left,
 * this family's whole history as one conversation in the middle, and the case
 * on the right — who holds them, what happens next, what they need, how to
 * reach them. Every control the old page had is still here; they moved from
 * five stacked panels into the three places people actually look.
 *
 * Every button posts to the same routes as before (/api/admin/city-ads,
 * /api/admin/seeker-touches, /api/admin/seeker-archive), so nothing about how
 * offers, hand-overs or messages behave has changed.
 */

/** What the route returns alongside the plan for a city lead. */
type Routing = Partial<Omit<CityLeadToolsData, "lead_id" | "status">> & {
  lead_id: string;
  status: string;
  can_route: boolean;
  qualification_reply: string | null;
  pool: { provider_id: string; name: string; position: number; enabled: boolean; already_offered: boolean }[];
  care_summary: string | null;
};

type CaseData = SeekerRelationship & { plan?: RoutingPlan | null; routing?: Routing | null };

const OFFER_WORD: Record<string, string> = { open: "Waiting on them", accepted: "Took it", declined: "Passed", expired: "No answer" };
const STEP_WORD: Record<PlanStep["state"], string> = {
  accepted: "Took it",
  declined: "Passed",
  expired: "No answer",
  sent: "Waiting on them",
  upcoming: "Not sent yet",
};

/** The relay runs on the city's clock, so the team should read the city's clock. */
const CITY_TZ: Record<string, string> = {
  "dallas-tx": "America/Chicago",
  "charlotte-nc": "America/New_York",
  "pascagoula-ms": "America/Chicago",
};

function tzFor(slug: string | null): string {
  return (slug && CITY_TZ[slug]) || "America/New_York";
}

function timeOf(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

function dayOf(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "short", day: "numeric" }).format(new Date(iso));
}

function shortWhen(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(new Date(iso));
}

/** "+18089406605" -> "(808) 940-6605". Anything else is shown as stored. */
function formatPhone(p: string): string {
  const d = p.replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p;
}

function firstName(label: string): string {
  return label.split(/\s+/)[0] || label;
}

function cityName(slug: string | null): string | null {
  if (!slug) return null;
  const city = slug.replace(/-[a-z]{2}$/, "");
  return city
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?"
  );
}

async function postCityAds(body: Record<string, unknown>): Promise<{ message?: string; result?: { action?: string; providerName?: string } }> {
  const res = await fetch("/api/admin/city-ads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
  return d;
}

// Every outcome startOrAdvance can return, named. A blanket "Offered." would be
// false for most of them, and this line is the only thing that tells the
// caller whether a provider was actually asked.
function routedSaid(r: { action?: string; providerName?: string } | undefined, fallback: string): { tone: "ok" | "err"; text: string } {
  const said: Record<string, { tone: "ok" | "err"; text: string }> = {
    offered: { tone: "ok", text: `Offered to ${r?.providerName ?? "the provider"}.` },
    parked: { tone: "ok", text: "Saved. It goes to a provider when their morning opens." },
    unfilled: { tone: "err", text: "Nobody left on call who has not already seen it. Nothing was sent." },
    closed: { tone: "err", text: "This family is closed or already taken. Nothing was sent." },
    held: { tone: "err", text: "Still held until we know what they need. Nothing was sent." },
    escalated: { tone: "err", text: "Still waiting on their reply. Nothing was sent." },
    noop: { tone: "err", text: "Nothing was sent. They may have opted out, or the provider may already have it." },
  };
  return r?.action && said[r.action] ? said[r.action] : { tone: "ok", text: fallback };
}

const card = "rounded-2xl border border-gray-200 bg-white";
const sectionTitle = "text-[15px] font-semibold text-gray-900";
const pillBtn = "rounded-lg bg-gray-100 px-3 py-1.5 text-[13px] font-semibold text-gray-900 hover:bg-gray-200 disabled:opacity-50";
const darkBtn = "rounded-lg bg-gray-900 px-3.5 py-2 text-[13.5px] font-semibold text-white hover:bg-gray-800 disabled:opacity-50";

function LockLine({ text }: { text: string }) {
  return (
    <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-gray-500">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
      {text}
    </p>
  );
}

// ── Left: the queue this family came from ─────────────────────────────────────

function FamilyList({ currentId, backQuery }: { currentId: string; backQuery: string | null }) {
  const [rows, setRows] = useState<SeekerRelationshipRow[] | null>(null);
  const back = useMemo(() => new URLSearchParams(backQuery ?? ""), [backQuery]);
  const tab: Tab = (TABS.find((t) => t.key === back.get("tab"))?.key ?? "reply") as Tab;
  const days = Number(back.get("days")) || 45;

  useEffect(() => {
    let live = true;
    fetch(`/api/admin/seeker-touches?days=${days}`)
      .then((r) => (r.ok ? r.json() : { rows: [] }))
      .then((d) => live && setRows(d.rows ?? []))
      .catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, [days]);

  const shown = (rows ?? []).filter((r) => matches(r, tab));
  const label = TABS.find((t) => t.key === tab)?.label ?? "Families";
  const q = backQuery ? `?back=${encodeURIComponent(backQuery)}` : "";

  return (
    <aside className="hidden min-h-0 flex-col bg-gray-50 lg:flex lg:h-full">
      <div className="px-4 pb-3 pt-5">
        <Link href={`/admin/relationships/families${backQuery ? `?${backQuery}` : ""}`} className="text-[13px] font-semibold text-gray-500 hover:text-gray-900">
          ‹ All families
        </Link>
        <h2 className="mt-2 text-[22px] font-bold tracking-tight text-gray-900">{label}</h2>
        <p className="text-[13px] text-gray-500">{rows ? `${shown.length} ${shown.length === 1 ? "family" : "families"}` : "Loading…"}</p>
      </div>
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-4">
        {shown.map((r) => {
          const on = r.seeker_id === currentId;
          const preview = r.last_inbound?.title ?? r.last_touch?.title ?? r.situation ?? "";
          const flag = r.flags[0];
          return (
            <li key={r.seeker_id}>
              <Link
                href={`/admin/relationships/families/${r.seeker_id}${q}`}
                className={`flex gap-3 rounded-xl px-2.5 py-2.5 ${on ? "bg-white shadow-sm" : "hover:bg-white/70"}`}
              >
                <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-gray-200 text-[12px] font-bold text-gray-700">
                  {initials(r.label)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[14px] font-semibold ${r.label_is_fallback ? "text-gray-500" : "text-gray-900"}`}>{r.label}</span>
                  {preview && <span className="block truncate text-[13px] text-gray-500">{preview}</span>}
                  {flag && <span className="block truncate text-[12px] text-gray-900">{SEEKER_FLAG_LABEL[flag as SeekerFlag]}</span>}
                </span>
              </Link>
            </li>
          );
        })}
        {rows && shown.length === 0 && <li className="px-3 py-4 text-[13px] text-gray-500">Nobody else is waiting here.</li>}
      </ul>
    </aside>
  );
}

// ── Middle: the conversation ──────────────────────────────────────────────────

/**
 * A row we draw as something someone said, rather than as an event.
 *
 * Texts the family received count as said, automatic or not: the qualifying
 * text and the "still looking" text are what she read, so they sit in the
 * conversation as Olera's. Automatic emails (digests, nudges) stay events, as
 * do logged touches (a call, or "email sent", which would otherwise repeat the
 * email it records) and the form submission itself.
 */
function isMessage(it: SeekerTimelineItem): boolean {
  if (it.author === "provider") return true;
  if (it.kind === "touch" || it.kind === "activity" || it.kind === "inquiry") return false;
  if (it.id.startsWith("city:")) return false;
  if (it.actor === "system") return it.channel === "text";
  return it.channel === "text" || it.channel === "email" || it.channel === "in_app";
}

function Conversation({ items, familyName, tz }: { items: SeekerTimelineItem[]; familyName: string; tz: string }) {
  const ordered = useMemo(() => [...items].sort((a, b) => (a.occurred_at < b.occurred_at ? -1 : 1)), [items]);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [ordered.length]);

  if (ordered.length === 0) {
    return <p className="py-10 text-center text-[14px] text-gray-500">Nothing on record yet.</p>;
  }

  let lastDay = "";
  return (
    <div className="flex flex-col gap-2.5">
      {ordered.map((it) => {
        const day = dayOf(it.occurred_at, tz);
        const header = day !== lastDay ? (lastDay = day) : null;
        const bad = !!it.status && /fail|bounce|complain/i.test(it.status);
        const via = it.channel === "text" ? "text" : it.channel === "email" ? "email" : it.channel === "in_app" ? "page" : null;
        const link = it.href ? (
          <Link href={it.href} className="ml-1 font-semibold text-gray-900 underline">
            Open
          </Link>
        ) : null;

        let body: ReactNode;
        if (!isMessage(it)) {
          body = (
            <div className="mx-auto max-w-[85%] text-center text-[12.5px] leading-snug text-gray-500">
              <span className="font-semibold text-gray-700">{it.title}</span>
              {it.detail ? <span> · {it.detail}</span> : null}
              <span className={bad ? " text-red-700" : ""}>
                {" · "}
                {timeOf(it.occurred_at, tz)}
                {it.status ? ` · ${it.status}` : ""}
              </span>
              {link}
            </div>
          );
        } else {
          const auto = it.actor === "system" && it.author !== "provider" && !it.sent_by_person;
          // Everything we sent sits on our side, typed or automatic.
          const mine = it.author !== "provider" && (it.actor === "out" || it.actor === "system");
          const who = it.author === "provider" ? (it.author_name ?? "The provider") : auto ? "Olera, automatic" : mine ? "Olera" : familyName;
          body = (
            <div className={`flex items-end gap-2 ${mine ? "justify-end" : ""}`}>
              {!mine && (
                <span
                  className={`grid h-8 w-8 flex-none place-items-center rounded-full text-[11px] font-bold text-white ${
                    it.author === "provider" ? "bg-[#417272]" : "bg-[#b5835a]"
                  }`}
                >
                  {initials(who)}
                </span>
              )}
              <div className={`max-w-[78%] ${mine ? "text-right" : ""}`}>
                <div
                  className={`inline-block whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-left text-[14.5px] leading-snug ${
                    auto ? "rounded-br-md bg-gray-200 text-gray-800" : mine ? "rounded-br-md bg-gray-900 text-white" : "rounded-bl-md bg-gray-100 text-gray-900"
                  }`}
                >
                  {it.full_text?.trim() || it.title}
                </div>
                <p className={`mt-1 text-[12px] ${bad ? "text-red-700" : "text-gray-500"}`}>
                  {who}
                  {it.detail ? ` · ${it.detail}` : ""}
                  {via ? ` · ${via}` : ""} · {timeOf(it.occurred_at, tz)}
                  {it.status ? ` · ${it.status}` : ""}
                  {link}
                </p>
              </div>
            </div>
          );
        }
        return (
          <div key={it.id}>
            {header && <p className="my-3 text-center text-[12px] font-semibold text-gray-500">{header}</p>}
            {body}
          </div>
        );
      })}
      <div ref={end} />
    </div>
  );
}

function Composer({
  routing,
  familyName,
  holder,
  suggestions,
  onSent,
}: {
  routing: Routing;
  familyName: string;
  holder: string | null;
  suggestions: { id: string; text: string; name: string }[];
  onSent: () => Promise<void>;
}) {
  const hasPhone = Boolean(routing.has_phone);
  const hasEmail = Boolean(routing.has_email);
  const [channel, setChannel] = useState<"sms" | "email">(hasPhone ? "sms" : "email");
  const [text, setText] = useState("");
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const pending = routing.pending_messages ?? [];
  const ready = text.trim() && (channel === "sms" || subject.trim());
  const readers = holder ? `${familyName} and ${holder}` : familyName;

  async function send(schedule: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      const d = await postCityAds({ action: "message_family", leadId: routing.lead_id, channel, message: text, subject, ...(schedule ? { schedule: true } : {}) });
      setMsg({ tone: "ok", text: d.message || (schedule ? "Scheduled for their morning." : "Sent.") });
      setText("");
      setSubject("");
      await onSent();
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : "Did not send" });
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    setBusy(true);
    try {
      await postCityAds({ action: "cancel_message", leadId: routing.lead_id, messageId: id });
      await onSent();
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : "Could not cancel" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sticky bottom-0 border-t border-gray-200 bg-white px-4 pb-4 pt-3 sm:px-6 lg:static">
      {pending.length > 0 && (
        <ul className="mb-2 space-y-1">
          {pending.map((m) => (
            <li key={m.id} className="flex items-baseline gap-2 text-[12.5px] text-gray-600">
              <span className="font-semibold text-gray-900">Scheduled</span>
              <span className="min-w-0 flex-1 truncate">{m.subject ?? m.body}</span>
              <button type="button" disabled={busy} onClick={() => void cancel(m.id)} className="font-semibold text-gray-900 underline disabled:opacity-50">
                Cancel
              </button>
            </li>
          ))}
        </ul>
      )}
      {suggestions.length > 0 && channel === "sms" && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[12.5px] text-gray-500">Ask for a YES:</span>
          {suggestions.map((s) => (
            <button key={s.id} type="button" onClick={() => setText(s.text)} className="rounded-full border border-gray-300 px-2.5 py-1 text-[12.5px] font-semibold text-gray-800 hover:border-gray-900">
              {s.name}
            </button>
          ))}
        </div>
      )}
      {channel === "email" && (
        <input
          aria-label="Email subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          className="mb-2 w-full rounded-xl border border-gray-300 px-3.5 py-2 text-[14px] text-gray-900 focus:border-gray-900 focus:outline-none"
        />
      )}
      <div className="flex items-end gap-2 rounded-3xl border border-gray-300 py-1.5 pl-4 pr-1.5 focus-within:border-gray-900">
        <textarea
          aria-label={`Message ${readers}`}
          rows={text.length > 90 ? 3 : 1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={channel === "sms" ? 480 : 10000}
          placeholder={`Message ${readers}`}
          className="min-w-0 flex-1 resize-none bg-transparent py-1.5 text-[14.5px] text-gray-900 placeholder:text-gray-400 focus:outline-none"
        />
        <button
          type="button"
          aria-label="Send now"
          disabled={busy || !ready}
          onClick={() => void send(false)}
          className="grid h-9 w-9 flex-none place-items-center rounded-full bg-gray-900 text-white disabled:bg-gray-300"
        >
          ↑
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[12.5px] text-gray-500">
        <span>
          To: <span className="font-semibold text-gray-900">{readers}</span> by{" "}
          {hasPhone && hasEmail ? (
            <button type="button" onClick={() => setChannel(channel === "sms" ? "email" : "sms")} className="font-semibold text-gray-900 underline">
              {channel === "sms" ? "text" : "email"}
            </button>
          ) : (
            <span className="font-semibold text-gray-900">{channel === "sms" ? "text" : "email"}</span>
          )}
        </span>
        <button type="button" disabled={busy || !ready} onClick={() => void send(true)} className="font-semibold text-gray-900 underline disabled:text-gray-400 disabled:no-underline">
          Send in their morning instead
        </button>
        {msg && <span className={msg.tone === "ok" ? "text-emerald-700" : "text-red-700"}>{msg.text}</span>}
      </div>
    </div>
  );
}

// ── Right: the case ───────────────────────────────────────────────────────────

function CasePanel({ data, familyName, tz, reload }: { data: CaseData; familyName: string; tz: string; reload: () => Promise<void> }) {
  const routing = data.routing ?? null;
  const plan = data.plan ?? null;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [need, setNeed] = useState(() => routing?.care_summary ?? "");
  const [note, setNote] = useState(routing?.admin_note ?? "");
  const [logOpen, setLogOpen] = useState(false);

  async function act(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setMsg(null);
    try {
      const d = await postCityAds(body);
      setMsg(d.message ? { tone: "ok", text: d.message } : routedSaid(d.result, done));
      await reload();
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : "Did not save" });
    } finally {
      setBusy(false);
    }
  }

  async function markActionDone(id: string) {
    setMsg(null);
    try {
      const res = await fetch("/api/admin/seeker-touches", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, done: true }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? "Could not mark that done");
      await reload();
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : "Could not mark that done" });
    }
  }

  const { profile, reach, consent, flags, providers, open_action: openAction } = data;
  const offers = routing?.offers ?? [];
  // Not once a provider holds them: the relay refuses a handed family, so
  // "Save and route" would only report "closed" and look broken.
  const canQualify = Boolean(routing?.can_route) && !routing?.handed_at && plan?.state === "held" && routing?.status !== "unfilled";
  const holderName = routing?.handed_at ? routing.campaign_owner : offers.find((o) => o.state === "accepted")?.provider_name ?? null;

  // The one thing to do next, most specific first.
  const next = openAction
    ? { title: openAction.text, when: openAction.due ? `Due ${openAction.due}` : null }
    : flags.includes("awaiting_reply")
      ? { title: `Reply to ${familyName}`, when: "They wrote and nobody has answered" }
      : flags.includes("tried_three")
        ? { title: "Send one last message, then archive", when: "Called three times, never reached" }
        : flags.includes("promise_owed")
          ? { title: `Call ${familyName}`, when: "We promised a call" }
          : flags.includes("provider_no_show")
            ? { title: "Find them another provider", when: "The provider never got back to them" }
            : null;

  const consentText =
    consent === "opted_out"
      ? "Opted out. No channel is open."
      : consent === "olera_only"
        ? "Olera only. Providers hear from us, not from them."
        : consent === "provider_ok"
          ? "They asked to be contacted by providers."
          : "No consent on record. Treat as Olera only.";

  return (
    <div className="flex flex-col gap-6 px-5 py-5">
      {next && (
        <section>
          <h3 className={sectionTitle}>Next step</h3>
          <div className="mt-2 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[14.5px] font-semibold text-gray-900">{next.title}</p>
              {next.when && <p className="text-[13px] text-gray-500">{next.when}</p>}
            </div>
            {openAction && (
              <button type="button" onClick={() => void markActionDone(openAction.touch_id)} className={pillBtn}>
                Done
              </button>
            )}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between gap-2">
          <h3 className={sectionTitle}>Log a call or note</h3>
          <button type="button" onClick={() => setLogOpen((v) => !v)} className={pillBtn} aria-expanded={logOpen}>
            {logOpen ? "Close" : "Log"}
          </button>
        </div>
        {logOpen && (
          <div className="mt-2">
            <LogFamilyTouch
              seekerId={profile.seeker_id}
              onLogged={async () => {
                setLogOpen(false);
                await reload();
              }}
            />
          </div>
        )}
      </section>

      <hr className="border-gray-200" />

      {(offers.length > 0 || routing?.handed_at || routing?.can_hand || routing?.can_route || providers.length > 0) && (
        <section>
          <h3 className={sectionTitle}>Providers</h3>
          {plan?.reason && !holderName && <p className="mt-1 text-[13px] text-gray-500">{plan.reason}</p>}
          <ul className="mt-2 space-y-2">
            {routing?.handed_at && (
              <li className={`${card} p-3`}>
                <p className="text-[14px] font-semibold text-gray-900">{routing.campaign_owner ?? "The ad's provider"}</p>
                <p className="text-[13px] text-gray-500">Their ad found this family · since {shortWhen(routing.handed_at, tz)}</p>
              </li>
            )}
            {offers.map((o) => (
              <li key={o.id} className={`${card} p-3 ${o.state === "expired" || o.state === "declined" ? "opacity-60" : ""}`}>
                <p className="text-[14px] font-semibold text-gray-900">{o.provider_name}</p>
                <p className="text-[13px] text-gray-500">
                  {OFFER_WORD[o.state]} · {shortWhen(o.offered_at, tz)}
                </p>
                {o.state === "open" && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" disabled={busy} className={pillBtn} onClick={() => void act({ action: "accept", offerId: o.id }, "Marked as taken.")}>
                      They said yes by phone
                    </button>
                    <button type="button" disabled={busy} className={pillBtn} onClick={() => void act({ action: "decline", offerId: o.id }, "Skipped.")}>
                      Skip
                    </button>
                  </div>
                )}
              </li>
            ))}
            {providers.map((p) => (
              <li key={`${p.id}-${p.at}`} className={`${card} p-3`}>
                <p className="text-[14px] font-semibold text-gray-900">{p.name}</p>
                <p className="text-[13px] text-gray-500">
                  Page inquiry · {p.responded ? "replied" : "no reply on file"} · {shortWhen(p.at, tz)}
                </p>
              </li>
            ))}
            {plan?.state === "held" &&
              !routing?.handed_at &&
              plan.candidates.slice(0, 3).map((c) => (
                <li key={`cand-${c.providerId}`} className="rounded-2xl border border-dashed border-gray-300 p-3">
                  <p className="text-[14px] font-semibold text-gray-700">{c.providerName}</p>
                  <p className="text-[13px] text-gray-500">Next on call once routed</p>
                </li>
              ))}
            {plan?.steps
              .filter((st) => st.state === "upcoming")
              .slice(0, 2)
              .map((st) => (
                <li key={`up-${st.providerId}`} className="rounded-2xl border border-dashed border-gray-300 p-3">
                  <p className="text-[14px] font-semibold text-gray-700">{st.providerName}</p>
                  <p className="text-[13px] text-gray-500">
                    {STEP_WORD[st.state]} · {st.projected ? "about " : ""}
                    {timeOf(st.at, tz)}
                  </p>
                </li>
              ))}
          </ul>

          {routing && (routing.can_hand || (routing.can_route && routing.pool.length > 0)) && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {routing.can_hand && (
                <button type="button" disabled={busy} className={darkBtn} onClick={() => void act({ action: "hand_to_primary", leadId: routing.lead_id }, "Handed over.")}>
                  Hand to {routing.campaign_owner}
                </button>
              )}
              {routing.can_route && routing.pool.length > 0 && (
                <select
                  aria-label="Offer to a provider"
                  value=""
                  disabled={busy}
                  onChange={(e) => {
                    if (e.target.value) void act({ action: "offer_to", leadId: routing.lead_id, providerId: e.target.value }, "Offered.");
                  }}
                  className="max-w-full rounded-lg bg-gray-100 px-3 py-1.5 text-[13px] font-semibold text-gray-900"
                >
                  <option value="">Offer to…</option>
                  {routing.pool.map((p) => (
                    <option key={p.provider_id} value={p.provider_id}>
                      {p.name}
                      {p.already_offered ? " (offered before)" : p.enabled ? "" : " (not on call)"}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {holderName && routing && !routing.closed && (
            <div className="mt-3">
              <p className="text-[13px] text-gray-500">How it went with {holderName}</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {routing.status !== "contacted" && (
                  <button type="button" disabled={busy} className={pillBtn} onClick={() => void act({ action: "set_status", leadId: routing.lead_id, status: "contacted" }, "Marked as reached.")}>
                    Reached
                  </button>
                )}
                <button type="button" disabled={busy} className={pillBtn} onClick={() => void act({ action: "set_status", leadId: routing.lead_id, status: "client" }, "Marked as a client.")}>
                  Became a client
                </button>
                <button type="button" disabled={busy} className={pillBtn} onClick={() => void act({ action: "set_status", leadId: routing.lead_id, status: "no_fit" }, "Marked not a fit.")}>
                  Not a fit
                </button>
                <button type="button" disabled={busy} className={pillBtn} onClick={() => void act({ action: "set_status", leadId: routing.lead_id, status: "unreachable" }, "Marked unreachable.")}>
                  Unreachable
                </button>
              </div>
            </div>
          )}
          {msg && <p className={`mt-2 text-[13px] ${msg.tone === "ok" ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p>}
        </section>
      )}

      <section>
        <h3 className={sectionTitle}>What {familyName} needs</h3>
        {routing?.qualification_reply || profile.situation ? (
          <p className="mt-1.5 text-[14.5px] text-gray-900">&ldquo;{routing?.qualification_reply ?? profile.situation}&rdquo;</p>
        ) : (
          <p className="mt-1.5 text-[14px] text-gray-500">Nothing on record yet.</p>
        )}
        {(profile.timeline || profile.payment.length > 0) && (
          <p className="mt-1 text-[13px] text-gray-500">
            {[profile.timeline?.replace(/_/g, " "), profile.payment.join(", ")].filter(Boolean).join(" · ")}
          </p>
        )}
        {canQualify && routing && (
          <div className="mt-3">
            <label htmlFor="case-need" className="text-[13px] text-gray-500">
              What the provider will read. Keep it to who needs care, what kind, and where.
            </label>
            <textarea
              id="case-need"
              rows={3}
              value={need}
              onChange={(e) => setNeed(e.target.value)}
              placeholder="What they told you: who needs care, what kind, and where"
              className="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2 text-[14px] text-gray-900 focus:border-gray-900 focus:outline-none"
              disabled={busy}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy || !need.trim()}
                onClick={() => void act({ action: "qualify", leadId: routing.lead_id, reply: need.trim() }, "Saved.")}
                className={darkBtn}
              >
                {busy ? "Saving…" : "Save and route"}
              </button>
              <span className="text-[12.5px] text-gray-500">Goes to the first provider on call, in their morning hours.</span>
            </div>
          </div>
        )}
      </section>

      <hr className="border-gray-200" />

      <section className="space-y-3">
        <h3 className={sectionTitle}>Contact</h3>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-gray-900">Phone</p>
            <p className="truncate text-[14px] text-gray-500">{profile.phone ? formatPhone(profile.phone) : "None on file"}</p>
          </div>
          {profile.phone && reach.phone !== "impossible" && (
            <div className="flex gap-2">
              <a href={`tel:${profile.phone}`} className={pillBtn}>
                Call
              </a>
              <Link href={`/admin/inbox?phone=${encodeURIComponent(profile.phone)}`} className={pillBtn}>
                Texts
              </Link>
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-gray-900">Email</p>
          <p className="truncate text-[14px] text-gray-500">{profile.email ?? "None on file"}</p>
        </div>
        {reach.note && <p className="text-[13px] text-amber-800">{reach.note}</p>}
        <div>
          <p className="text-[14px] font-semibold text-gray-900">Consent</p>
          <p className="text-[14px] text-gray-500">{consentText}</p>
        </div>
        <div>
          <p className="text-[14px] font-semibold text-gray-900">Came from</p>
          <p className="text-[14px] text-gray-500">
            {ORIGIN_LABEL[data.origin]}
            {data.city_slug ? ` · ${cityName(data.city_slug)}` : ""}
          </p>
        </div>
      </section>

      {routing && (
        <section>
          <label htmlFor="case-note" className={sectionTitle}>
            Private note
          </label>
          <textarea
            id="case-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Only our team sees this."
            className="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2 text-[14px] text-gray-900 focus:border-gray-900 focus:outline-none"
          />
          {note !== (routing.admin_note ?? "") && (
            <button type="button" disabled={busy} className={`${pillBtn} mt-1.5`} onClick={() => void act({ action: "note", leadId: routing.lead_id, note }, "Note saved.")}>
              Save note
            </button>
          )}
        </section>
      )}
    </div>
  );
}

/** One case panel, placed by screen width, so its form fields exist once. */
function useIsDesktop(): boolean {
  const [desk, setDesk] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setDesk(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desk;
}

// ── Page ──────────────────────────────────────────────────────────────────────

function CaseInner() {
  const { seekerId } = useParams<{ seekerId: string }>();
  // The list carries the view it was showing in ?back=, so both ways out of
  // this page land where you left, and the left column shows the same queue.
  const backQuery = useSearchParams().get("back");
  const backHref = `/admin/relationships/families${backQuery ? `?${backQuery}` : ""}`;
  const [data, setData] = useState<CaseData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unarchiving, setUnarchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const isDesktop = useIsDesktop();

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
    setData(null);
    void load();
  }, [load]);

  const putBack = useCallback(async () => {
    setUnarchiving(true);
    setArchiveError(null);
    try {
      const res = await fetch("/api/admin/seeker-archive", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seekerId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setArchiveError(json.error ?? "Could not put them back");
        return;
      }
      await load();
    } catch {
      setArchiveError("Could not put them back");
    } finally {
      setUnarchiving(false);
    }
  }, [seekerId, load]);

  const tz = tzFor(data?.city_slug ?? null);
  const familyName = data ? (data.profile.label_is_fallback ? "this family" : firstName(data.profile.label)) : "";
  const routing = data?.routing ?? null;
  const holder = routing?.handed_at ? (routing.campaign_owner ?? null) : null;

  // "Ask for a YES" drafts. Only providers the relay would actually send this
  // family to (the care-type-matched candidates) or has already offered them
  // to, so a home-care family is never drafted a text about an assisted living
  // facility. The provider is named, because a yes to "an agency" is not a yes
  // to anyone.
  const suggestions = useMemo(() => {
    if (!data || !routing || !routing.can_route || routing.handed_at || !routing.has_phone) return [];
    const plan = data.plan ?? null;
    const short = (n: string) => n.split(/\s+-\s+|,\s/)[0].trim();
    const picks = new Map<string, string>();
    for (const c of plan?.candidates ?? []) if (!picks.has(c.providerId)) picks.set(c.providerId, c.providerName);
    for (const p of routing.pool) if (p.already_offered && !picks.has(p.provider_id)) picks.set(p.provider_id, p.name);
    const hello = data.profile.label_is_fallback ? "there" : familyName;
    return Array.from(picks, ([id, name]) => ({ id, name })).slice(0, 3).map((p) => ({
      id: p.id,
      name: short(p.name),
      text: `Hi ${hello}, this is Olera. ${short(p.name)} can help with the care you asked about. Is it okay if I pass your number to them so they can call you? Reply YES and I'll set it up.`,
    }));
  }, [data, routing, familyName]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-[14px] text-red-700">{error}</p>
        <Link href={backHref} className="mt-3 inline-block text-[14px] font-semibold text-gray-900 underline">
          Back to families
        </Link>
      </div>
    );
  }

  const lockText = !data
    ? ""
    : holder
      ? `${holder} sees the texts here and the calls you log`
      : data.consent === "olera_only" || data.consent === "unknown"
        ? "Only the Olera team sees this. Providers get the summary, not the conversation."
        : "Only the Olera team sees this page";

  const where = !data
    ? ""
    : data.archived
      ? `Archived · ${data.archived.reason.replace(/_/g, " ")}`
      : holder
        ? `With ${holder}`
        : data.episode.state === "waiting"
          ? `${data.episode.blocked_on} has it`
          : EPISODE_WORD[data.episode.state];

  // Below md the admin's tab bar is fixed to the bottom (73px). Padding the
  // scroll area for it is enough: a sticky composer stops at the padding edge,
  // so it sits just above the bar.
  return (
    <div className="h-full overflow-y-auto bg-white pb-[4.75rem] md:pb-0 lg:grid lg:grid-cols-[300px_minmax(0,1fr)_360px] lg:overflow-hidden">
      <FamilyList currentId={seekerId} backQuery={backQuery} />

      <main className="flex min-w-0 flex-col border-gray-200 lg:h-full lg:min-h-0 lg:border-l">
        <header className="border-b border-gray-200 px-4 py-4 sm:px-6">
          <Link href={backHref} className="text-[13px] font-semibold text-gray-500 hover:text-gray-900 lg:hidden">
            ‹ All families
          </Link>
          {!data ? (
            <p className="text-[14px] text-gray-400">Loading…</p>
          ) : (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className={`text-[24px] font-bold tracking-tight ${data.profile.label_is_fallback ? "text-gray-500" : "text-gray-900"}`}>{data.profile.label}</h1>
                <p className="text-[14px] text-gray-500">
                  {[cityName(data.city_slug) ?? data.profile.city, where].filter(Boolean).join(" · ")}
                </p>
                <LockLine text={lockText} />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {data.flags.map((f) => (
                  <span key={f} className="rounded-full bg-gray-100 px-2.5 py-1 text-[12px] font-semibold text-gray-800">
                    {SEEKER_FLAG_LABEL[f]}
                  </span>
                ))}
                {data.archived && (
                  <button type="button" disabled={unarchiving} onClick={() => void putBack()} className={pillBtn}>
                    {unarchiving ? "Putting back…" : "Put back"}
                  </button>
                )}
              </div>
            </div>
          )}
          {archiveError && <p className="mt-1 text-[13px] text-red-700">{archiveError}</p>}
        </header>

        {data && (
          <>
            {/* On a phone the case comes before the conversation: who has
                them and what to do next is what you open the page to see. */}
            {!isDesktop && (
              <div className="border-b border-gray-200">
                <CasePanel key={`m-${seekerId}`} data={data} familyName={familyName} tz={tz} reload={load} />
              </div>
            )}
            <div className="px-4 py-5 sm:px-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              <Conversation items={data.items} familyName={data.profile.label_is_fallback ? "Family" : data.profile.label} tz={tz} />
            </div>
            {routing && !routing.closed && (routing.has_phone || routing.has_email) ? (
              <Composer key={seekerId} routing={routing} familyName={familyName} holder={holder} suggestions={suggestions} onSent={load} />
            ) : routing ? (
              <div className="border-t border-gray-200 px-4 py-3 text-[13px] text-gray-500 sm:px-6">
                {routing.closed ? "This family is closed, so nothing further goes out from here." : "No phone or email on file to write to."}
              </div>
            ) : (
              data.profile.phone &&
              data.reach.phone !== "impossible" && (
                <div className="border-t border-gray-200 px-4 py-3 text-[13px] text-gray-500 sm:px-6">
                  This family isn&apos;t from a city ad, so texts go through{" "}
                  <Link href={`/admin/inbox?phone=${encodeURIComponent(data.profile.phone)}`} className="font-semibold text-gray-900 underline">
                    Messages
                  </Link>
                  .
                </div>
              )
            )}
          </>
        )}
      </main>

      <aside className="hidden min-h-0 overflow-y-auto border-l border-gray-200 lg:block lg:h-full">
        {data && isDesktop && <CasePanel key={`d-${seekerId}`} data={data} familyName={familyName} tz={tz} reload={load} />}
      </aside>
    </div>
  );
}

export default function AdminSeekerCasePage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-4 py-10 text-[14px] text-gray-400">Loading…</div>}>
      <CaseInner />
    </Suspense>
  );
}

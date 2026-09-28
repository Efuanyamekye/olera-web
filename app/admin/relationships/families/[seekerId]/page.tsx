"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ORIGIN_LABEL, EPISODE_WORD } from "@/lib/seeker-touches/present";
import type { PlanStep, RoutingPlan } from "@/lib/city-ads/plan.server";
import LogFamilyTouch from "@/components/admin/LogFamilyTouch";
import { NavigatorDraftEditor, type NavigatorDetail } from "@/components/admin/BenefitsFamiliesView";
import type { BenefitsCaseView } from "@/lib/benefits/case-view.server";
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
  qualification_verdict?: string | null;
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

  // The list page's origin filter (?from=benefits) carries through, so a
  // Benefits queue opens into benefits families, not the mixed queue.
  const origin = back.get("from");
  const shown = (rows ?? []).filter((r) => matches(r, tab) && (!origin || r.origin === origin));
  const label = `${TABS.find((t) => t.key === tab)?.label ?? "Families"}${origin && ORIGIN_LABEL[origin as keyof typeof ORIGIN_LABEL] ? ` · ${ORIGIN_LABEL[origin as keyof typeof ORIGIN_LABEL]}` : ""}`;
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
  // A page inquiry's own conversation: the family, the provider and Olera.
  if (it.connection_id && (it.actor === "in" || it.olera_post)) return true;
  if (it.kind === "touch" || it.kind === "activity" || it.kind === "inquiry") return false;
  if (it.id.startsWith("city:")) return false;
  if (it.actor === "system") return it.channel === "text";
  return it.channel === "text" || it.channel === "email" || it.channel === "in_app";
}

/**
 * The words of an email, from its Gmail snippet: entities decoded and the
 * quoted message it replies to cut off ("On Thu, … wrote:"), so the bubble
 * shows what they said rather than what we said to them.
 */
function emailWords(snippet: string): string {
  const decoded = snippet
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
  const cut = decoded.search(/\s*On (Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,? .{0,80}?wrote:/i);
  return (cut > 0 ? decoded.slice(0, cut) : decoded).trim();
}

/**
 * Three levels of loudness (the "Quieter Case Timeline" proposal):
 *
 *   said        words someone wrote to someone else: bubbles
 *   moment      what changed the case: offers, inquiries, a logged call, an
 *               outcome, a send that failed. A thin line or a small card.
 *   background  automatic and passive things (emails and whether they were
 *               opened, clicks, page visits). Folded into one line per run.
 *
 * A notice that repeats a message ("X replied to you") joins that message's
 * line instead of taking a row of its own. "Everything" shows every row flat.
 */
type Tier = "said" | "moment" | "background";

const REPEATS_A_MESSAGE = /replied to you|sent you a message|you can now message/i;

function tierOf(it: SeekerTimelineItem): Tier {
  const failed = !!it.status && /fail|bounce|complain/i.test(it.status);
  if (isMessage(it)) return "said";
  if (failed) return "moment";
  if (it.id.startsWith("city:") || it.id.startsWith("offer-") || it.id.startsWith("conn:")) return "moment";
  // A logged call, meeting or note is a moment; a logged "email sent" or
  // "text sent" repeats a message already on the page.
  if (it.kind === "touch") return it.channel === "text" || it.channel === "email" ? "background" : "moment";
  if (/outcome/i.test(it.title)) return "moment";
  return "background";
}

type Row =
  | { type: "said"; item: SeekerTimelineItem; alsoEmailed: string | null }
  | { type: "moment"; items: SeekerTimelineItem[] }
  | { type: "call"; item: SeekerTimelineItem }
  | { type: "fold"; items: SeekerTimelineItem[] };

function buildRows(ordered: SeekerTimelineItem[]): Row[] {
  const rows: Row[] = [];
  for (const it of ordered) {
    const tier = tierOf(it);
    const last = rows[rows.length - 1];
    if (tier === "said") {
      rows.push({ type: "said", item: it, alsoEmailed: null });
      continue;
    }
    // A notice announcing the message just above it joins that message.
    if (
      tier === "background" &&
      last?.type === "said" &&
      REPEATS_A_MESSAGE.test(it.title) &&
      new Date(it.occurred_at).getTime() - new Date(last.item.occurred_at).getTime() < 30 * 60 * 1000
    ) {
      last.alsoEmailed = it.status ? `emailed, ${it.status}` : "emailed";
      continue;
    }
    if (tier === "moment") {
      if (it.kind === "touch") {
        rows.push({ type: "call", item: it });
        continue;
      }
      // A run of offers, or of inquiries, reads as one line.
      const kindOf = (x: SeekerTimelineItem) => (x.id.startsWith("offer-") ? "offer" : x.id.startsWith("conn:") ? "conn" : x.id);
      const failed = !!it.status && /fail|bounce|complain/i.test(it.status);
      const mergeable = kindOf(it) === "offer" || kindOf(it) === "conn";
      // The run can be broken only by folded background (the email each
      // inquiry sends), not by anything said: "Asked X and Y", one fold after.
      const prev = last?.type === "fold" ? rows[rows.length - 2] : last;
      const near =
        prev?.type === "moment" &&
        new Date(it.occurred_at).getTime() - new Date(prev.items[prev.items.length - 1].occurred_at).getTime() < 60 * 60 * 1000;
      if (!failed && mergeable && prev?.type === "moment" && kindOf(prev.items[0]) === kindOf(it) && near) {
        prev.items.push(it);
      } else {
        rows.push({ type: "moment", items: [it] });
      }
      continue;
    }
    if (last?.type === "fold") last.items.push(it);
    else rows.push({ type: "fold", items: [it] });
  }
  return rows;
}

/** "Offer #2 to Cambridge Caregivers" → "Cambridge Caregivers". */
function targetOf(title: string): string {
  const m = title.match(/ to (.+)$/);
  return (m ? m[1] : title).split(/\s+-\s+|,\s/)[0].trim();
}

function offerOutcome(it: SeekerTimelineItem): string {
  const d = it.detail ?? "";
  if (/took it/i.test(d)) return "took it";
  if (/passed/i.test(d)) return "passed";
  if (/ran out/i.test(d)) return "no answer";
  if (/NEVER REACHED/i.test(d)) return "never reached them";
  return "waiting";
}

function joinNames(names: string[]): string {
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function momentText(items: SeekerTimelineItem[]): { text: ReactNode; warn: boolean } {
  const first = items[0];
  const failed = !!first.status && /fail|bounce|complain/i.test(first.status);
  if (failed) return { text: <>Didn&apos;t reach them: {first.title}</>, warn: true };
  if (first.id.startsWith("offer-")) {
    const outcomes = Array.from(new Set(items.map(offerOutcome)));
    const outcome = outcomes.length === 1 ? outcomes[0] : outcomes.join(", ");
    return {
      text:
        items.length === 1 ? (
          <>
            Offered to <b className="font-semibold text-gray-900">{targetOf(first.title)}</b> · {outcome}
          </>
        ) : (
          <>
            Offered to {items.length} agencies · {outcome}
          </>
        ),
      warn: outcomes.includes("never reached them"),
    };
  }
  if (first.id.startsWith("conn:")) {
    return {
      text: (
        <>
          Asked <b className="font-semibold text-gray-900">{joinNames(items.map((x) => targetOf(x.title)))}</b>
        </>
      ),
      warn: false,
    };
  }
  if (/outcome reported/i.test(first.title)) return { text: "Told us how it went", warn: false };
  return { text: first.title, warn: false };
}

function MomentIcon({ id, warn }: { id: string; warn: boolean }) {
  const stroke = warn ? "#b54708" : "#417272";
  const d = id.startsWith("offer-") || id.startsWith("conn:") ? "M22 2 11 13M22 2 15 22l-4-9-9-4 20-7z" : id.startsWith("city:") ? "M12 5v14M5 12h14" : "M20 6 9 17l-5-5";
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none">
      <path d={d} />
    </svg>
  );
}

function Conversation({ items, familyName, tz }: { items: SeekerTimelineItem[]; familyName: string; tz: string }) {
  const ordered = useMemo(() => [...items].sort((a, b) => (a.occurred_at < b.occurred_at ? -1 : 1)), [items]);
  const rows = useMemo(() => buildRows(ordered), [ordered]);
  const [everything, setEverything] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [ordered.length]);

  if (ordered.length === 0) {
    return <p className="py-10 text-center text-[14px] text-gray-500">Nothing on record yet.</p>;
  }

  const eventLine = (it: SeekerTimelineItem, key?: string) => {
    const bad = !!it.status && /fail|bounce|complain/i.test(it.status);
    return (
      <div key={key} className="mx-auto max-w-[85%] text-center text-[12.5px] leading-snug text-gray-500">
        <span className="font-semibold text-gray-700">{it.title}</span>
        {it.detail ? <span> · {it.detail}</span> : null}
        <span className={bad ? " text-red-700" : ""}>
          {" · "}
          {timeOf(it.occurred_at, tz)}
          {it.status ? ` · ${it.status}` : ""}
        </span>
        {it.href ? (
          <Link href={it.href} className="ml-1 font-semibold text-gray-900 underline">
            Open
          </Link>
        ) : null}
      </div>
    );
  };

  // Like iMessage: delivery shows only under our latest message (failures
  // always show), and the "Open" links and system notes live in Everything.
  const lastOurs = [...ordered].reverse().find((x) => isMessage(x) && x.author !== "provider" && (x.actor === "out" || x.actor === "system"))?.id;
  const messageRow = (it: SeekerTimelineItem, alsoEmailed: string | null) => {
    const bad = !!it.status && /fail|bounce|complain/i.test(it.status);
    const via = it.channel === "text" ? "text" : it.channel === "email" ? "email" : it.channel === "in_app" ? "page" : null;
    const auto = it.actor === "system" && it.author !== "provider" && !it.sent_by_person;
    // Everything we sent sits on our side, typed or automatic.
    const mine = it.author !== "provider" && (it.actor === "out" || it.actor === "system");
    // A support@ email keeps its words in the snippet and its subject in the
    // title, so the bubble shows the words with the subject above.
    const email = it.kind === "support" && it.detail ? emailWords(it.detail) : null;
    const who =
      it.author === "provider"
        ? (it.author_name ?? "The provider")
        : auto
          ? "Olera, automatic"
          : it.olera_post && it.author_name
            ? `Olera · ${it.author_name}`
            : mine
              ? "Olera"
              : familyName;
    return (
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
            className={`inline-block max-w-full whitespace-pre-wrap [overflow-wrap:anywhere] rounded-2xl px-3.5 py-2.5 text-left text-[14.5px] leading-snug ${
              auto ? "rounded-br-md bg-gray-200 text-gray-800" : mine ? "rounded-br-md bg-gray-900 text-white" : "rounded-bl-md bg-gray-100 text-gray-900"
            }`}
          >
            {email ? (
              <>
                <span className={`mb-0.5 block text-[12px] font-semibold ${mine && !auto ? "text-gray-300" : "text-gray-500"}`}>{it.title}</span>
                {email}
              </>
            ) : (
              it.full_text?.trim() || it.title
            )}
          </div>
          <p className={`mt-1 text-[12px] ${bad ? "text-red-700" : "text-gray-500"}`}>
            {who}
            {it.detail && !email && (everything || it.kind !== "sms") ? ` · ${it.detail}` : ""}
            {via && everything ? ` · ${via}` : ""} · {timeOf(it.occurred_at, tz)}
            {it.status && (everything || bad || it.id === lastOurs) ? ` · ${it.status}` : ""}
            {alsoEmailed ? ` · ${alsoEmailed}` : ""}
            {it.href && everything ? (
              <Link href={it.href} className="ml-1 font-semibold text-gray-900 underline">
                Open
              </Link>
            ) : null}
          </p>
        </div>
      </div>
    );
  };

  // Day headers go on the first visible row of each day.
  let lastDay = "";
  const dayHeader = (iso: string) => {
    const day = dayOf(iso, tz);
    if (day === lastDay) return null;
    lastDay = day;
    return <p className="my-3 text-center text-[12px] font-semibold text-gray-500">{day}</p>;
  };

  const toggle = (
    <div className="mb-2 flex justify-end">
      <div className="flex gap-1 rounded-full bg-gray-100 p-1 text-[12.5px] font-semibold" role="tablist" aria-label="Show">
        {(["Conversation", "Everything"] as const).map((label) => {
          const on = (label === "Everything") === everything;
          return (
            <button
              key={label}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setEverything(label === "Everything")}
              className={`rounded-full px-3 py-1 ${on ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );

  if (everything) {
    return (
      <div className="flex flex-col gap-2.5">
        {toggle}
        {ordered.map((it) => (
          <div key={it.id}>
            {dayHeader(it.occurred_at)}
            {isMessage(it) ? messageRow(it, null) : eventLine(it)}
          </div>
        ))}
        {/* On a phone the newest row must clear the floating Message pill. */}
      <div ref={end} className="h-20 lg:h-0" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {toggle}
      {rows.map((row) => {
        if (row.type === "said") {
          return (
            <div key={row.item.id}>
              {dayHeader(row.item.occurred_at)}
              {messageRow(row.item, row.alsoEmailed)}
            </div>
          );
        }
        if (row.type === "call") {
          const it = row.item;
          const missed = !!it.status && /did not reach|no answer|voicemail/i.test(it.status);
          const kind = it.channel === "call" ? "Call" : it.channel === "meeting" ? "Meeting" : "Note";
          const label = missed ? `${kind} · didn't reach them` : it.status?.includes("spoke") || it.status?.includes("reached") ? `${kind} · reached them` : kind;
          return (
            <div key={it.id}>
              {dayHeader(it.occurred_at)}
              <div className="mx-auto flex w-full max-w-[520px] items-start gap-2.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={missed ? "#b54708" : "#417272"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 flex-none">
                  {it.channel === "call" ? (
                    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
                  ) : (
                    <path d="M4 4h16v12H8l-4 4z" />
                  )}
                </svg>
                <div className="min-w-0 text-[13px] leading-snug">
                  <p className="font-semibold text-gray-900">{label}</p>
                  <p className="text-gray-600">
                    {it.full_text?.trim() || it.title} · {timeOf(it.occurred_at, tz)}
                  </p>
                </div>
              </div>
            </div>
          );
        }
        if (row.type === "moment") {
          const { text, warn } = momentText(row.items);
          const key = row.items[0].id;
          const many = row.items.length > 1;
          return (
            <div key={key}>
              {dayHeader(row.items[0].occurred_at)}
              <button
                type="button"
                disabled={!many}
                onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}
                className="flex w-full items-center gap-3 text-[12.5px] text-gray-600 disabled:cursor-default"
              >
                <span className="h-px min-w-[12px] flex-1 bg-gray-200" />
                {/* Icon beside one run of text, time inline, so a long line
                    wraps as a sentence on a phone. */}
                <span className={`inline-flex max-w-[85%] items-start gap-1.5 text-left leading-snug ${warn ? "text-[#b54708]" : ""}`}>
                  <span className="mt-[2px]">
                    <MomentIcon id={row.items[0].id} warn={warn} />
                  </span>
                  <span>
                    {text} <span className="whitespace-nowrap text-gray-400">· {timeOf(row.items[0].occurred_at, tz)}</span>
                    {many && <span className="ml-1 text-[10px] text-gray-400">{open[key] ? "▴" : "▾"}</span>}
                  </span>
                </span>
                <span className="h-px min-w-[12px] flex-1 bg-gray-200" />
              </button>
              {many && open[key] && <div className="mt-1.5 flex flex-col gap-1">{row.items.map((it) => eventLine(it, it.id))}</div>}
            </div>
          );
        }
        // fold
        const key = row.items[0].id;
        const emails = row.items.filter((x) => x.kind === "email" || x.channel === "email");
        const opened = emails.filter((x) => /open|click/i.test(x.status ?? "")).length;
        const others = row.items.length - emails.length;
        const parts: string[] = [];
        if (emails.length) {
          parts.push(`${emails.length} automatic email${emails.length === 1 ? "" : "s"}`);
          if (opened) parts.push(opened === emails.length && emails.length > 1 ? "all opened" : `${opened} opened`);
        }
        if (others) parts.push(`${others} other update${others === 1 ? "" : "s"}`);
        return (
          <div key={key}>
            {dayHeader(row.items[0].occurred_at)}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}
                aria-expanded={!!open[key]}
                className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[12px] text-gray-500 hover:border-gray-400"
              >
                {parts.join(" · ")} <span className="text-[10px]">{open[key] ? "▴" : "▾"}</span>
              </button>
            </div>
            {open[key] && (
              <div className="mx-auto mt-2 flex max-w-[560px] flex-col gap-1 border-l-2 border-gray-100 pl-3 text-[12px] text-gray-500">
                {row.items.map((it) => (
                  <span key={it.id}>
                    {shortWhen(it.occurred_at, tz)} {timeOf(it.occurred_at, tz)} · {it.title}
                    {it.status ? ` · ${it.status}` : ""}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {/* On a phone the newest row must clear the floating Message pill. */}
      <div ref={end} className="h-20 lg:h-0" />
    </div>
  );
}

/** The composer at the foot of the conversation on a laptop. */
const INLINE_SHELL = "border-t border-gray-200 bg-white px-4 pb-4 pt-3 sm:px-6";

function Composer({
  routing,
  familyName,
  holder,
  suggestions,
  onSent,
  shell = INLINE_SHELL,
  onDone,
}: {
  routing: Routing;
  familyName: string;
  holder: string | null;
  suggestions: { id: string; text: string; name: string }[];
  onSent: () => Promise<void>;
  /** Wrapper classes: inline at the foot of the conversation, or inside the phone sheet. */
  shell?: string;
  /** Called after a successful send, so the phone sheet can close. */
  onDone?: () => void;
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
      onDone?.();
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
    <div className={shell}>
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
          rows={shell !== INLINE_SHELL ? 3 : text.length > 90 ? 3 : 1}
          // In the phone sheet the keyboard should come up with it.
          autoFocus={shell !== INLINE_SHELL}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={channel === "sms" ? 480 : 10000}
          // The To: line under the box names the readers; a placeholder that
          // long wrapped and was cut off on a phone.
          placeholder="Write a message…"
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

/**
 * Writes into a page inquiry's conversation as Olera. Both the family and the
 * provider see it in their inbox and get an email, so the box names them both.
 */
function InquiryComposer({
  conversations,
  familyName,
  onSent,
  shell = INLINE_SHELL,
  onDone,
}: {
  conversations: { connection_id: string; name: string }[];
  familyName: string;
  onSent: () => Promise<void>;
  shell?: string;
  onDone?: () => void;
}) {
  const [pick, setPick] = useState(conversations[0]?.connection_id ?? "");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const current = conversations.find((c) => c.connection_id === pick) ?? conversations[0];
  const provider = current ? current.name : "the provider";
  const readers = `${familyName} and ${provider}`;

  async function send() {
    if (!current) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/connections/${current.connection_id}/olera-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setMsg({ tone: "ok", text: d.notice || "Sent." });
      setText("");
      await onSent();
      onDone?.();
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : "Did not send" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={shell}>
      <div className="flex items-end gap-2 rounded-3xl border border-gray-300 py-1.5 pl-4 pr-1.5 focus-within:border-gray-900">
        <textarea
          aria-label={`Message ${readers}`}
          rows={shell !== INLINE_SHELL ? 3 : text.length > 90 ? 3 : 1}
          // In the phone sheet the keyboard should come up with it.
          autoFocus={shell !== INLINE_SHELL}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={4000}
          // The To: line under the box names the readers; a placeholder that
          // long wrapped and was cut off on a phone.
          placeholder="Write a message…"
          className="min-w-0 flex-1 resize-none bg-transparent py-1.5 text-[14.5px] text-gray-900 placeholder:text-gray-400 focus:outline-none"
        />
        <button
          type="button"
          aria-label="Send"
          disabled={busy || !text.trim()}
          onClick={() => void send()}
          className="grid h-9 w-9 flex-none place-items-center rounded-full bg-gray-900 text-white disabled:bg-gray-300"
        >
          ↑
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[12.5px] text-gray-500">
        <span>
          To: <span className="font-semibold text-gray-900">{readers}</span>, in their inbox and by email
        </span>
        {conversations.length > 1 && (
          <select
            aria-label="Which conversation"
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            className="rounded-lg bg-gray-100 px-2 py-1 text-[12.5px] font-semibold text-gray-900"
          >
            {conversations.map((c) => (
              <option key={c.connection_id} value={c.connection_id}>
                With {c.name}
              </option>
            ))}
          </select>
        )}
        {msg && <span className={msg.tone === "ok" ? "text-emerald-700" : "text-red-700"}>{msg.text}</span>}
      </div>
    </div>
  );
}

// ── Right: the case ───────────────────────────────────────────────────────────

/**
 * Writes to a family who is not on a city ad and has no open provider
 * conversation: most benefits families. Until 2026-09-28 the page sent these
 * to Messages. Text goes through the inbox's own send path (quiet hours,
 * do-not-contact, the drafted answer marked sent); email is a plain personal
 * note with replies to support@. A drafted research answer, when one is
 * waiting, sits above the box with the reason it needs a person.
 */
function FamilyComposer({
  seekerId,
  familyName,
  hasPhone,
  hasEmail,
  draft,
  onSent,
  shell = INLINE_SHELL,
  onDone,
}: {
  seekerId: string;
  familyName: string;
  hasPhone: boolean;
  hasEmail: boolean;
  draft: BenefitsCaseView["draftAnswer"];
  onSent: () => Promise<void>;
  shell?: string;
  onDone?: () => void;
}) {
  const [channel, setChannel] = useState<"sms" | "email">(hasPhone ? "sms" : "email");
  const [text, setText] = useState("");
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const ready = text.trim() && (channel === "sms" || subject.trim());

  async function send(sendNow: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/families/${seekerId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, body: text, subject, sendNow }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error ?? "Did not send");
      setMsg({ tone: "ok", text: d.message ?? "Sent." });
      setText("");
      setSubject("");
      await onSent();
      onDone?.();
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : "Did not send" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={shell}>
      {draft && !text && (
        <div className="mb-2 rounded-2xl bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-900">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-semibold">A drafted answer is waiting</span>
            <button
              type="button"
              onClick={() => {
                setChannel(hasPhone ? "sms" : "email");
                setText(draft.body);
              }}
              className="font-semibold underline"
            >
              Use it
            </button>
          </div>
          <p className="mt-1 line-clamp-2 text-amber-800">{draft.body}</p>
          {draft.reasons.length > 0 && <p className="mt-1 text-[12px] text-amber-700">Needs a person: {draft.reasons.join("; ")}</p>}
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
          aria-label={`Message ${familyName}`}
          rows={shell !== INLINE_SHELL ? 3 : text.length > 90 ? 3 : 1}
          autoFocus={shell !== INLINE_SHELL}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={channel === "sms" ? 480 : 10000}
          placeholder="Write a message…"
          className="min-w-0 flex-1 resize-none bg-transparent py-1.5 text-[14.5px] text-gray-900 placeholder:text-gray-400 focus:outline-none"
        />
        <button
          type="button"
          aria-label="Send"
          disabled={busy || !ready}
          onClick={() => void send(false)}
          className="grid h-9 w-9 flex-none place-items-center rounded-full bg-gray-900 text-white disabled:bg-gray-300"
        >
          ↑
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[12.5px] text-gray-500">
        <span>
          To: <span className="font-semibold text-gray-900">{familyName}</span> by{" "}
          {hasPhone && hasEmail ? (
            <button type="button" onClick={() => setChannel(channel === "sms" ? "email" : "sms")} className="font-semibold text-gray-900 underline">
              {channel === "sms" ? "text" : "email"}
            </button>
          ) : (
            <span className="font-semibold text-gray-900">{channel === "sms" ? "text" : "email"}</span>
          )}
        </span>
        {channel === "sms" && <span>Outside their hours it waits for their morning.</span>}
        {channel === "sms" && (
          <button type="button" disabled={busy || !ready} onClick={() => void send(true)} className="font-semibold text-gray-900 underline disabled:text-gray-400 disabled:no-underline">
            Send now anyway
          </button>
        )}
        {msg && <span className={msg.tone === "ok" ? "text-emerald-700" : "text-red-700"}>{msg.text}</span>}
      </div>
    </div>
  );
}

const APPLICATION_WORD: Record<string, string> = {
  called: "Called",
  no_answer: "Called, no answer",
  applied: "Applied",
  need_docs: "Needs documents",
  waiting: "Waiting on the agency",
  stuck: "Stuck",
  not_eligible: "Not eligible",
};
const HOLD_WORD: Record<string, string> = {
  sms_reply: "they texted back",
  email_reply: "they emailed back",
  deceased: "their message suggests someone died",
  sms_opt_out: "they texted STOP",
};

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
}

/**
 * The program card: the benefits counterpart of the Providers section. For a
 * benefits family the other party is a program, not a provider, so this shows
 * which program we sent them to and its number, how far they've got, the
 * letter (read and approved here), whether automation is paused, who owns
 * their help request, and the text companion.
 */
function BenefitsSection({
  seekerId,
  view,
  familyLabel,
  hasEmail,
  textable,
  reload,
}: {
  seekerId: string;
  view: BenefitsCaseView;
  familyLabel: string;
  hasEmail: boolean;
  textable: boolean;
  reload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [letterOpen, setLetterOpen] = useState(false);
  const [navigator, setNavigator] = useState<NavigatorDetail | null>(null);

  const post = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/admin/benefits/families/${seekerId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      return { res, d };
    },
    [seekerId],
  );

  async function act(action: "hold_clear" | "resolved" | "reopen", done: string) {
    setBusy(true);
    setMsg(null);
    try {
      const { res, d } = await post({ action });
      if (!res.ok) throw new Error(d?.error ?? "Did not save");
      setMsg({ tone: "ok", text: done });
      await reload();
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : "Did not save" });
    } finally {
      setBusy(false);
    }
  }

  async function openLetter() {
    if (letterOpen) {
      setLetterOpen(false);
      return;
    }
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/benefits/families/${seekerId}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d?.navigator) throw new Error(d?.error ?? "Couldn't load the letter");
      setNavigator(d.navigator as NavigatorDetail);
      setLetterOpen(true);
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : "Couldn't load the letter" });
    }
  }

  // Same behaviour as the caseload: a send the facts gate blocks asks once,
  // naming the reason, before sending anyway.
  const onNavigator = async (
    action: "navigator_send" | "navigator_dismiss" | "navigator_test" | "navigator_recompose" | "navigator_save" | "navigator_schedule" | "navigator_unschedule" | "navigator_build_packet",
    subject?: string,
    letter?: string,
    sms?: string,
    testEmail?: string,
    scheduledAt?: string,
    overridePacket?: boolean,
  ): Promise<boolean> => {
    setBusy(true);
    setMsg(null);
    try {
      let { res, d } = await post({ action, subject, body: letter, sms, testEmail, scheduledAt, overridePacket });
      if (res.status === 409 && action === "navigator_send" && !overridePacket && d?.error) {
        if (!window.confirm(`${d.error}\n\nSend it anyway?`)) {
          setMsg({ tone: "err", text: d.error });
          return false;
        }
        ({ res, d } = await post({ action, subject, body: letter, sms, testEmail, scheduledAt, overridePacket: true }));
      }
      if (!res.ok) {
        setMsg({ tone: "err", text: d?.error ?? "That didn't go through. Try again." });
        return false;
      }
      if (action !== "navigator_test") {
        const fresh = await fetch(`/api/admin/benefits/families/${seekerId}`).then((r) => r.json()).catch(() => null);
        if (fresh?.navigator) setNavigator(fresh.navigator as NavigatorDetail);
        await reload();
      }
      if (action === "navigator_send") setLetterOpen(false);
      return true;
    } catch {
      setMsg({ tone: "err", text: "That didn't go through. Try again." });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const p = view.program;
  const status = view.progress.applicationStatus ? APPLICATION_WORD[view.progress.applicationStatus] ?? view.progress.applicationStatus : null;
  const letterLine =
    view.letter.status === "sent" && view.letter.sentAt
      ? `Letter sent ${shortDate(view.letter.sentAt)}${view.letter.sentVia === "auto" ? " (automatic)" : view.letter.sentVia === "scheduler" ? " (scheduled)" : ""}`
      : view.letter.status === "pending"
        ? view.letter.scheduledAt
          ? `Letter scheduled for ${shortDate(view.letter.scheduledAt)}`
          : "Letter written, not sent yet"
        : view.letter.status === "dismissed"
          ? "Letter dismissed"
          : "No letter yet";

  return (
    <section>
      <h3 className={sectionTitle}>Benefits</h3>

      {p ? (
        <div className="mt-2 rounded-xl border border-gray-200 px-3.5 py-3">
          <p className="text-[14.5px] font-semibold text-gray-900">{p.shortName}</p>
          {p.name !== p.shortName && <p className="text-[12.5px] text-gray-500">{p.name}</p>}
          {p.phone && (
            <p className="mt-1.5 text-[13.5px] text-gray-800">
              {p.contactLabel ? `${p.contactLabel}: ` : ""}
              <span className="font-semibold tabular-nums">{p.phone}</span>
              {p.hours && <span className="text-gray-500"> · {p.hours}</span>}
            </p>
          )}
          {p.switchLine && <p className="mt-1 text-[12.5px] text-gray-500">{p.switchLine}</p>}
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px]">
            {view.planUrl && (
              <a href={view.planUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-gray-900 underline">
                Their plan ↗
              </a>
            )}
            {p.programPath && (
              <a href={p.programPath} target="_blank" rel="noopener noreferrer" className="font-semibold text-gray-900 underline">
                Program page ↗
              </a>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-1 text-[13px] text-gray-500">No program with a phone number on file for them yet.</p>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[12px] font-semibold text-gray-800">{letterLine}</span>
        {view.progress.calledAt && (
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-semibold text-emerald-800">Made the call {shortDate(view.progress.calledAt)}</span>
        )}
        {status && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-semibold text-emerald-800">{status}</span>}
        {view.smsConsentAt && (
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[12px] font-semibold text-gray-800">Agreed to texts {shortDate(view.smsConsentAt)}</span>
        )}
        {view.companion && (
          <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[12px] font-semibold text-indigo-800">
            Text companion: {view.companion.arm === "companion" ? "in the conversation" : "control group"}
          </span>
        )}
        {view.companion?.urgency === "yes" && (
          <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[12px] font-semibold text-rose-800">Said something is urgent</span>
        )}
        {view.companion?.day14 && (
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[12px] font-semibold text-gray-800">
            Day 14: {view.companion.day14 === "yes" ? "got through" : "not yet"}
          </span>
        )}
      </div>

      {view.letter.status === "pending" && (
        <div className="mt-3">
          <button type="button" onClick={() => void openLetter()} className={pillBtn}>
            {letterOpen ? "Close the letter" : "Read the letter"}
          </button>
          {letterOpen && navigator && (
            <div className="mt-3 [&_textarea]:w-full">
              <NavigatorDraftEditor
                navigator={navigator}
                reviewContext={{ state: null, careNeed: null, situation: null, completedAt: view.completedAt, firstName: null }}
                familyLabel={familyLabel}
                hasEmail={hasEmail}
                textable={textable}
                busy={busy}
                onNavigator={onNavigator}
              />
            </div>
          )}
        </div>
      )}

      {view.help && (
        <p className={`mt-3 text-[13px] ${view.help.overdue ? "font-semibold text-red-700" : "text-gray-700"}`}>
          Asked for a person{view.help.owner ? ` · ${view.help.owner} owns it` : ""}
          {view.help.dueAt ? ` · ${view.help.overdue ? "overdue since" : "due"} ${shortDate(view.help.dueAt)}` : ""}
        </p>
      )}

      {view.hold && (
        <div className="mt-3 flex items-center gap-3 rounded-xl bg-amber-50 px-3.5 py-2.5">
          <p className="min-w-0 flex-1 text-[13px] text-amber-900">
            Automated messages paused: {HOLD_WORD[view.hold.reason] ?? view.hold.reason}.
            {view.hold.needsExplicitResume ? " Resume only if that was misread." : " Replying to them resumes it."}
          </p>
          <button type="button" disabled={busy} onClick={() => void act("hold_clear", "Automated messages resumed.")} className={pillBtn}>
            Resume
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {view.resolvedAt && (!view.help || view.resolvedAt > view.help.openedAt) ? (
          <button type="button" disabled={busy} onClick={() => void act("reopen", "Reopened.")} className={pillBtn}>
            Reopen their case
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={() => void act("resolved", "Marked resolved.")} className={pillBtn}>
            Mark resolved
          </button>
        )}
        {view.contactedAt && <span className="text-[12.5px] text-gray-500">Last reached {shortDate(view.contactedAt)}</span>}
      </div>
      {msg && <p className={`mt-2 text-[13px] ${msg.tone === "ok" ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p>}
    </section>
  );
}

function CasePanel({
  data,
  familyName,
  tz,
  reload,
  benefits,
}: {
  data: CaseData;
  familyName: string;
  tz: string;
  reload: () => Promise<void>;
  benefits: BenefitsCaseView | null;
}) {
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
  // Who goes next, named. The button offers to exactly this provider (offer_to,
  // not offer_next), so the label can never disagree with what happens. It was
  // an unnamed "Offer to next" that sent Marla to Palm2Palm when Ces meant
  // Assisting Hands.
  const nextUp =
    plan?.state === "held"
      ? (plan.candidates[0] ? { id: plan.candidates[0].providerId, name: plan.candidates[0].providerName } : null)
      : (() => {
          const st = plan?.steps.find((x) => x.state === "upcoming");
          return st ? { id: st.providerId, name: st.providerName } : null;
        })();
  // Never for someone judged not to be a family (a job seeker, spam): the
  // relay holds them on purpose. For a family still held because they have not
  // said what they need, it stays available but secondary, because Save and
  // route is the usual way.
  const judgedNotFamily = Boolean(routing?.qualification_verdict) && routing?.qualification_verdict !== "care_seeker";
  const heldUnanswered = plan?.state === "held";
  const canOfferNext =
    Boolean(routing?.can_route) &&
    !routing?.handed_at &&
    !routing?.closed &&
    !judgedNotFamily &&
    !offers.some((o) => o.state === "open") &&
    Boolean(nextUp);
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
          : data.origin === "benefits"
            ? "Came for benefits. We don't share them with providers."
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

      {benefits?.isBenefits && (
        <BenefitsSection
          key={`b-${profile.seeker_id}`}
          seekerId={profile.seeker_id}
          view={benefits}
          familyLabel={profile.label_is_fallback ? profile.email ?? "this family" : profile.label}
          hasEmail={Boolean(profile.email)}
          textable={Boolean(profile.phone) && Boolean(benefits.smsConsentAt) && consent !== "opted_out"}
          reload={reload}
        />
      )}

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

          {routing && canOfferNext && nextUp && (
            <button
              type="button"
              disabled={busy}
              className={`${heldUnanswered ? pillBtn : darkBtn} mt-3 w-full py-2`}
              onClick={() => void act({ action: "offer_to", leadId: routing.lead_id, providerId: nextUp.id }, "Offered.")}
            >
              Offer to {nextUp.name.split(/\s+-\s+|,\s/)[0]} (next on call)
            </button>
          )}
          {routing && canOfferNext && nextUp && (
            <p className="mt-1 text-[12.5px] text-gray-500">
              {heldUnanswered
                ? "Sends now, before we know what they need. Save and route is the usual way."
                : "Sends now, even outside their morning hours."}
            </p>
          )}

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
  // The benefits side of the case (program card, drafted answer). Null for a
  // family who never used the benefits finder; loaded beside the case, never
  // blocking it.
  const [benefits, setBenefits] = useState<BenefitsCaseView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unarchiving, setUnarchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const isDesktop = useIsDesktop();
  const [mobileTab, setMobileTab] = useState<"conversation" | "case">("conversation");
  const [sheetOpen, setSheetOpen] = useState(false);
  // A new family starts on its conversation with the sheet closed.
  useEffect(() => {
    setMobileTab("conversation");
    setSheetOpen(false);
  }, [seekerId]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [res, bres] = await Promise.all([
        fetch(`/api/admin/seeker-touches?seeker=${seekerId}`),
        fetch(`/api/admin/benefits/case/${seekerId}`).catch(() => null),
      ]);
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json());
      setBenefits(bres && bres.ok ? ((await bres.json()) as BenefitsCaseView) : null);
    } catch {
      setError("Failed to load this family. Reload to try again.");
    }
  }, [seekerId]);

  useEffect(() => {
    setData(null);
    setBenefits(null);
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

  // Texting from the family composer needs their say-so: text consent on
  // file, or they texted us first. A phone typed into a provider inquiry is
  // not consent to texts from Olera. The server enforces the same rule.
  const familyMayText = Boolean(
    data &&
      data.profile.phone &&
      data.reach.phone !== "impossible" &&
      data.consent !== "opted_out" &&
      (benefits?.smsConsentAt || data.items.some((it) => it.channel === "text" && it.actor === "in")),
  );

  // What the family can be written to, if anything. The same box sits at the
  // foot of the conversation on a laptop and in a sheet on a phone.
  const openInquiries = data
    ? data.providers.filter((p) => p.connection_id && (p.status === "pending" || p.status === "accepted"))
    : [];
  const composerFor = (shell: string | undefined, onDone?: () => void) =>
    !data ? null : routing && !routing.closed && (routing.has_phone || routing.has_email) ? (
      <Composer key={seekerId} routing={routing} familyName={familyName} holder={holder} suggestions={suggestions} onSent={load} shell={shell} onDone={onDone} />
    ) : !routing && openInquiries.length > 0 ? (
      // Only conversations Olera can write in: a declined or archived one is
      // closed to the family and the provider too.
      <InquiryComposer
        key={seekerId}
        conversations={openInquiries.map((p) => ({ connection_id: p.connection_id as string, name: p.name }))}
        familyName={familyName === "this family" ? "the family" : familyName}
        onSent={load}
        shell={shell}
        onDone={onDone}
      />
    ) : !routing && (familyMayText || data.profile.email) ? (
      // Everyone else, which is most benefits families: Olera writes to them
      // directly instead of sending the reader off to Messages.
      <FamilyComposer
        key={seekerId}
        seekerId={seekerId}
        familyName={familyName === "this family" ? "the family" : familyName}
        hasPhone={familyMayText}
        hasEmail={Boolean(data.profile.email)}
        draft={benefits?.draftAnswer ?? null}
        onSent={load}
        shell={shell}
        onDone={onDone}
      />
    ) : null;
  const canWrite = Boolean(composerFor(undefined));
  const noWriteNote = !data || canWrite ? null : routing ? (
    routing.closed ? "This family is closed, so nothing further goes out from here." : "No phone or email on file to write to."
  ) : data.profile.phone && data.reach.phone !== "impossible" ? (
    <>
      This family isn&apos;t from a city ad, so texts go through{" "}
      <Link href={`/admin/inbox?phone=${encodeURIComponent(data.profile.phone)}`} className="font-semibold text-gray-900 underline">
        Messages
      </Link>
      .
    </>
  ) : null;

  const title = data ? (data.profile.label_is_fallback ? "No name on file" : data.profile.label) : "";
  const subtitle = data
    ? [data.profile.label_is_fallback ? data.profile.label : null, cityName(data.city_slug) ?? data.profile.city, where].filter(Boolean).join(" · ")
    : "";

  // iPhone Safari zooms the whole page into any field whose text is under
  // 16px when it is tapped, and stays zoomed, so the page looked wider than
  // the phone. Every field on this page is at least 16px below lg, including
  // the ones inside LogFamilyTouch.
  return (
    <div className="h-full overflow-y-auto bg-white pb-28 max-lg:[&_input]:!text-[16px] max-lg:[&_select]:!text-[16px] max-lg:[&_textarea]:!text-[16px] lg:grid lg:grid-cols-[300px_minmax(0,1fr)_360px] lg:overflow-hidden lg:pb-0">
      <FamilyList currentId={seekerId} backQuery={backQuery} />

      {/* PHONE: nothing is fixed to the bottom edge. A Message pill floats
          over the content, which fades out beneath them
          (the Jupiter pattern), instead of the admin tab bar plus a composer
          slab that took a third of the screen and never met the edge cleanly. */}
      {!isDesktop && (
        <>
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 h-28 bg-gradient-to-t from-white via-white/80 to-transparent" />
          {canWrite && !sheetOpen && (
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+16px)] right-4 z-30 flex items-center gap-2 rounded-full bg-gray-900 px-5 py-3.5 text-[15px] font-semibold text-white shadow-[0_6px_20px_rgba(0,0,0,0.25)]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Message
            </button>
          )}
          {sheetOpen && (
            <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Write a message">
              <button type="button" aria-label="Close" className="absolute inset-0 bg-black/30 motion-safe:animate-[fade-in_150ms_ease-out]" onClick={() => setSheetOpen(false)} />
              <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-8px_30px_rgba(0,0,0,0.15)] motion-safe:animate-[sheet-up_220ms_cubic-bezier(0.2,0.8,0.2,1)]">
                <div className="flex items-center justify-between px-5 pb-1 pt-3">
                  <span className="mx-auto h-1 w-10 rounded-full bg-gray-300" aria-hidden="true" />
                </div>
                {composerFor("bg-white px-4 pb-4 pt-2", () => setSheetOpen(false))}
              </div>
            </div>
          )}
        </>
      )}

      <main className="flex min-w-0 flex-col border-gray-200 lg:h-full lg:min-h-0 lg:border-l">
        <header className="border-b border-gray-200 px-4 pb-4 pt-[calc(env(safe-area-inset-top,0px)+16px)] sm:px-6 lg:pt-4">
          {!data ? (
            <p className="text-[14px] text-gray-400">Loading…</p>
          ) : (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className={`text-[26px] font-bold tracking-tight lg:text-[24px] ${data.profile.label_is_fallback ? "text-gray-500" : "text-gray-900"}`}>{title}</h1>
                <p className="break-words text-[14px] text-gray-500">{subtitle}</p>
                <LockLine text={lockText} />
                {/* On a phone one line says what is wrong; the Next step in the
                    Case tab says what to do about it. */}
                {!isDesktop && data.flags[0] && (
                  <p className="mt-2 text-[14px] font-semibold text-gray-900">{SEEKER_FLAG_LABEL[data.flags[0]]}</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {isDesktop &&
                  data.flags.map((f) => (
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

        {data && !isDesktop && (
          <div className="sticky top-0 z-10 flex items-center gap-6 border-b border-gray-200 bg-white/95 px-4 backdrop-blur" role="tablist">
            {/* The way back rides with the tabs, so it stays in reach as you
                scroll without floating over anything. */}
            <Link
              href={backHref}
              aria-label="Back to families"
              className="-ml-1 grid h-9 w-9 flex-none place-items-center rounded-full bg-gray-100 text-[18px] font-semibold text-gray-900"
            >
              ‹
            </Link>
            {(["conversation", "case"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={mobileTab === t}
                onClick={() => setMobileTab(t)}
                className={`-mb-px border-b-2 py-3 text-[15px] font-semibold ${mobileTab === t ? "border-gray-900 text-gray-900" : "border-transparent text-gray-400"}`}
              >
                {t === "conversation" ? "Conversation" : "Case"}
              </button>
            ))}
          </div>
        )}

        {data && (
          <>
            {!isDesktop && mobileTab === "case" && <CasePanel key={`m-${seekerId}`} data={data} familyName={familyName} tz={tz} reload={load} benefits={benefits} />}
            {(isDesktop || mobileTab === "conversation") && (
              <div className="px-4 py-5 sm:px-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                <Conversation items={data.items} familyName={data.profile.label_is_fallback ? "Family" : data.profile.label} tz={tz} />
                {!isDesktop && noWriteNote && <p className="mt-6 text-center text-[13px] text-gray-500">{noWriteNote}</p>}
              </div>
            )}
            {isDesktop && (composerFor(undefined) ?? (noWriteNote && <div className="border-t border-gray-200 px-4 py-3 text-[13px] text-gray-500 sm:px-6">{noWriteNote}</div>))}
          </>
        )}
      </main>

      <aside className="hidden min-h-0 overflow-y-auto border-l border-gray-200 lg:block lg:h-full">
        {data && isDesktop && <CasePanel key={`d-${seekerId}`} data={data} familyName={familyName} tz={tz} reload={load} benefits={benefits} />}
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

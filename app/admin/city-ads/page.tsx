"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

/**
 * /admin/city-ads — Olera-owned city campaigns.
 *
 * Three blocks, one column, one question each:
 *   Needs you  — leads waiting on a human (unfilled, offer past due, parked past
 *                its morning). Empty most days; when not, first on the page.
 *   Leads      — one line each: who, what, who has it. Tap to open the chain
 *                and the outcome buttons.
 *   Setup      — one line per city. Everything editable lives behind "edit".
 *
 * Nothing is an input at rest. Conversion rate and cost per accepted family
 * are deliberately not here; they arrive in Slack on the day-5 and day-14
 * reads. Design pass: https://claude.ai/code/artifact/8faff70d-8262-4ad1-be62-748c0eb13493
 */

type Campaign = {
  id: string;
  slug: string;
  city: string;
  state: string;
  ring_label: string | null;
  channel: string;
  campaign_tag: string;
  utm_medium: string;
  platform_campaign_id: string | null;
  flight_start: string | null;
  flight_end: string | null;
  budget_cents: number | null;
  max_cpc_cents: number | null;
  status: string;
  ad_spend_cents: number | null;
  ad_clicks: number | null;
  ad_impressions: number | null;
  metrics_updated_at: string | null;
};

type Provider = { id: string; display_name: string | null; city: string | null; phone: string | null; email: string | null } | null;
type PoolRow = { id: string; slug: string; provider_id: string; position: number; care_types: string[]; enabled: boolean; phone_override: string | null; provider: Provider };
type Offer = { id: string; provider_id: string; position: number; offered_at: string; expires_at: string; accepted_at: string | null; declined_at: string | null; decline_reason: string | null; expired_at: string | null; provider: Provider };
type Lead = {
  id: string;
  slug: string;
  utm_medium: string | null;
  care_recipient: string | null;
  care_type: string;
  urgency: string | null;
  zip: string | null;
  first_name: string;
  phone: string;
  email: string | null;
  note: string | null;
  payment_type: string | null;
  status: string;
  accepted_offer_id: string | null;
  next_offer_at: string | null;
  reached_at: string | null;
  family_check_sent_at: string | null;
  family_check_reply: string | null;
  provider_nudged_at: string | null;
  outcome_ping_1_at: string | null;
  outcome_ping_2_at: string | null;
  outcome: string | null;
  admin_note: string | null;
  created_at: string;
  offers: Offer[];
};

const CARE: Record<string, string> = { home_care: "help at home", assisted_living: "assisted living", unsure: "not sure yet", medical: "medical (redirected)" };
const WHO: Record<string, string> = { parent: "a parent", spouse: "a spouse", self: "themselves", other: "someone else" };
const WHEN: Record<string, string> = { this_week: "this week", this_month: "this month", planning: "planning ahead" };
const PAY: Record<string, string> = { private_pay: "private pay", medicaid: "Medicaid", va: "VA", ltc_insurance: "LTC insurance", unsure: "payment not decided" };

const fmtTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" }) : "";
const ago = (iso: string | null | undefined) => {
  if (!iso) return null;
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};
const minsLeft = (iso: string) => Math.round((new Date(iso).getTime() - Date.now()) / 60000);
const money = (c: number | null | undefined) => (c === null || c === undefined ? "" : `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`);
const phoneFmt = (p: string | null | undefined) => {
  const d = (p ?? "").replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p ?? "";
};
const cityName = (slug: string, campaigns: Campaign[]) => campaigns.find((c) => c.slug === slug)?.city ?? slug;

const openOffer = (l: Lead) => l.offers.find((o) => !o.accepted_at && !o.declined_at && !o.expired_at);
const acceptedOffer = (l: Lead) => l.offers.find((o) => o.accepted_at);

/** Why a lead is in "Needs you", or null. */
function needsReason(l: Lead): string | null {
  if (l.status === "new" && !l.accepted_offer_id && l.offers.length === 0) return "call them — concierge city, no chain runs";
  if (l.status === "unfilled") return "no one on call took it";
  if (l.family_check_reply === "not_yet" && !l.reached_at) return "family says the provider has not called";
  const o = openOffer(l);
  if (o && minsLeft(o.expires_at) < 0) return `offer to ${o.provider?.display_name ?? "a provider"} is past its 30 minutes`;
  if (l.status === "new" && l.next_offer_at && new Date(l.next_offer_at) < new Date()) return "parked past its morning and not offered";
  return null;
}

/** The one-line state on the right of a lead row. */
function stateLine(l: Lead): { text: string; tone: "ok" | "wait" | "warn" | "quiet" } {
  if (l.status === "client") return { text: "became a client", tone: "ok" };
  if (l.status === "no_fit") return { text: "not a fit", tone: "quiet" };
  if (l.status === "unreachable") return { text: "unreachable", tone: "quiet" };
  if (l.status === "stopped") return { text: "stopped", tone: "quiet" };
  if (l.status === "redirected") return { text: "medical, redirected", tone: "quiet" };
  if (needsReason(l)) return { text: "needs you", tone: "warn" };
  const a = acceptedOffer(l);
  if (l.status === "contacted") return { text: `${a?.provider?.display_name ?? "provider"} reached them`, tone: "ok" };
  if (a && l.family_check_sent_at && !l.family_check_reply) return { text: "asked if they were called", tone: "wait" };
  if (a) return { text: `${a.provider?.display_name ?? "a provider"} has it`, tone: "ok" };
  const o = openOffer(l);
  if (o) return { text: `offered to ${o.provider?.display_name ?? "a provider"} · ${minsLeft(o.expires_at)} min left`, tone: "wait" };
  if (l.status === "new" && l.next_offer_at) return { text: `waiting for 8am · ${fmtTime(l.next_offer_at)}`, tone: "wait" };
  if (l.status === "new") return { text: "waiting for you to call", tone: "warn" };
  return { text: l.status, tone: "quiet" };
}

const TONE: Record<string, string> = {
  ok: "bg-success-50 text-success-700",
  wait: "bg-primary-50 text-primary-800",
  warn: "bg-warm-50 text-warm-700",
  quiet: "bg-gray-100 text-gray-600",
};

export default function CityAdsAdminPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [pool, setPool] = useState<PoolRow[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [lastClockRun, setLastClockRun] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [openLead, setOpenLead] = useState<string | null>(null);
  const [openCity, setOpenCity] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/city-ads", { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const d = await res.json();
      setCampaigns(d.campaigns);
      setPool(d.pool);
      setLeads(d.leads);
      setLastClockRun(d.lastClockRun ?? null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);
    const tick = setInterval(() => setTick((n) => n + 1), 30_000); // keeps "min left" honest between polls
    return () => {
      clearInterval(t);
      clearInterval(tick);
    };
  }, [load]);

  const flash = (msg: string, ms = 3500) => {
    setToast(msg);
    setTimeout(() => setToast(null), ms);
  };

  const act = async (label: string, body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/city-ads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      flash(d.result?.providerName ? `${label}: ${d.result.providerName}` : `${label}: done`);
      await load();
      return true;
    } catch (e) {
      flash(`${label} failed: ${e instanceof Error ? e.message : "error"}`, 6000);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const runClock = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/cron/city-lead-offers", { cache: "no-store" });
      const d = await res.json().catch(() => ({}));
      const s = d.summary ?? d;
      flash(res.ok ? `Clock ran: ${s.started ?? 0} started, ${s.expired ?? 0} expired, ${s.advanced ?? 0} advanced` : `Clock failed: ${d.error || res.status}`, 6000);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const cities = useMemo(() => Array.from(new Set(campaigns.map((c) => c.slug))), [campaigns]);
  const needs = useMemo(() => leads.filter((l) => needsReason(l)), [leads]);
  const weekAgo = Date.now() - 7 * 86400000;
  const leadsThisWeek = leads.filter((l) => new Date(l.created_at).getTime() > weekAgo && l.care_type !== "medical").length;
  const liveCount = campaigns.filter((c) => c.status === "live").length;
  const onCall = pool.filter((p) => p.enabled).length;
  const today = new Date().toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "long", day: "numeric", month: "short" });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-7">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold text-gray-900">City campaigns</h1>
          <Link href="/admin/ad-boost" className="text-sm text-primary-700 underline-offset-2 hover:underline">
            Provider queue
          </Link>
        </div>
        <p className="mt-1 text-sm text-gray-600 tabular-nums">
          {today} · <b className="font-semibold text-gray-900">{liveCount}</b> live · <b className="font-semibold text-gray-900">{onCall}</b> on call ·{" "}
          <b className="font-semibold text-gray-900">{leadsThisWeek}</b> {leadsThisWeek === 1 ? "lead" : "leads"} this week
          {lastClockRun && <span className="text-gray-400"> · clock ran {ago(lastClockRun)}</span>}
        </p>
      </header>

      {error && <div className="mb-4 rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">{error}</div>}
      {toast && <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>}

      {/* Needs you */}
      <Eyebrow>Needs you</Eyebrow>
      {needs.length === 0 ? (
        <p className="mb-8 text-sm text-gray-500">Nothing needs you.</p>
      ) : (
        <div className="mb-8 rounded-xl border border-warm-200 bg-warm-25 px-4 py-1">
          {needs.map((l) => {
            const reason = needsReason(l)!;
            const pastDue = reason.includes("past its 30 minutes") || reason.startsWith("parked");
            return (
              <div key={l.id} className="flex flex-wrap items-start justify-between gap-3 border-t border-warm-100 py-3 first:border-t-0">
                <div className="min-w-0">
                  <div>
                    <span className="font-semibold text-gray-900">{l.first_name}</span>{" "}
                    <a className="text-sm text-primary-700" href={`tel:${l.phone}`}>
                      {phoneFmt(l.phone)}
                    </a>
                  </div>
                  <div className="mt-0.5 text-xs text-gray-600">
                    {cityName(l.slug, campaigns)} · {CARE[l.care_type]} for {WHO[l.care_recipient ?? "other"]}, {WHEN[l.urgency ?? ""] ?? ""} · {reason}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {pastDue ? (
                    <button className={btnPri} disabled={busy} onClick={() => void runClock()}>
                      Advance now
                    </button>
                  ) : (
                    <OfferTo lead={l} pool={pool} busy={busy} primary onPick={(pid) => void act("Offer", { action: "offer_to", leadId: l.id, providerId: pid })} />
                  )}
                  <button className={btn} disabled={busy} onClick={() => void act("Stop", { action: "set_status", leadId: l.id, status: "stopped" })}>
                    Stop
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Leads */}
      <Eyebrow>Leads</Eyebrow>
      <div className="mb-8 rounded-xl border border-gray-200 bg-white px-4">
        {leads.length === 0 && (
          <p className="py-5 text-sm text-gray-500">Leads land here the moment a family submits. Offers go to enabled providers in order, 30 minutes each.</p>
        )}
        {leads.map((l) => {
          const st = stateLine(l);
          const open = openLead === l.id;
          return (
            <div key={l.id} className="border-t border-gray-100 first:border-t-0">
              <button type="button" onClick={() => setOpenLead(open ? null : l.id)} className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 text-left">
                <span className="min-w-0">
                  <span className="font-semibold text-gray-900">{l.first_name}</span>
                  <span className="ml-2 text-sm text-gray-600">
                    {cityName(l.slug, campaigns)} · {CARE[l.care_type]} for {WHO[l.care_recipient ?? "other"]}
                    {l.urgency ? `, ${WHEN[l.urgency]}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-2 text-xs text-gray-500">
                  <span className={`rounded px-1.5 py-0.5 font-medium ${TONE[st.tone]}`}>{st.text}</span>
                  <span>{fmtTime(l.created_at)}</span>
                </span>
              </button>
              {open && <LeadDetail lead={l} pool={pool} busy={busy} act={act} />}
            </div>
          );
        })}
      </div>

      {/* Setup */}
      <Eyebrow>Setup</Eyebrow>
      <div className="rounded-xl border border-gray-200 bg-white px-4">
        {cities.length === 0 && <p className="py-5 text-sm text-gray-500">No campaigns yet. Apply migration 207.</p>}
        {cities.map((slug) => {
          const cs = campaigns.filter((c) => c.slug === slug);
          const ps = pool.filter((p) => p.slug === slug);
          const enabled = ps.filter((p) => p.enabled).length;
          const latestTyped = cs.map((c) => c.metrics_updated_at).filter(Boolean).sort().pop() ?? null;
          const open = openCity === slug;
          return (
            <div key={slug} className="border-t border-gray-100 first:border-t-0">
              <div className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <div className="font-semibold text-gray-900">
                    {cs[0]?.city}, {cs[0]?.state}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-600">
                    {cs.map((c) => `${cap(c.channel)} ${c.status}`).join(" · ")} · {enabled} on call · {latestTyped ? `spend typed ${ago(latestTyped)}` : "spend not typed yet"}
                  </div>
                  {enabled === 0 && (
                    <div className="mt-1 text-xs text-warm-700">
                      Concierge: requests are captured and you call the family. No provider is texted until one is switched on here.
                    </div>
                  )}
                </div>
                <button className={btn} onClick={() => setOpenCity(open ? null : slug)}>
                  {open ? "close" : "edit"}
                </button>
              </div>
              {open && <CityEditor slug={slug} campaigns={cs} pool={ps} busy={busy} act={act} />}
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-gray-400">Page conversion and cost per accepted family arrive in Slack on the day-5 and day-14 reads, not here.</p>
    </div>
  );
}

/* ---------- pieces ---------- */

const btn = "rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50";
const btnPri = "rounded-md border border-gray-900 bg-gray-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50";
const input = "rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-900 tabular-nums";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{children}</p>;
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function OfferTo({ lead, pool, busy, primary, onPick }: { lead: Lead; pool: PoolRow[]; busy: boolean; primary?: boolean; onPick: (providerId: string) => void }) {
  const seen = new Set(lead.offers.map((o) => o.provider_id));
  return (
    <select
      className={`${primary ? btnPri : btn} appearance-none pr-6`}
      value=""
      disabled={busy}
      onChange={(e) => {
        if (e.target.value) onPick(e.target.value);
      }}
    >
      <option value="">Offer to…</option>
      {pool
        .filter((p) => p.slug === lead.slug)
        .map((p) => (
          <option key={p.id} value={p.provider_id}>
            {p.provider?.display_name ?? p.provider_id.slice(0, 8)}
            {seen.has(p.provider_id) ? " (already offered)" : p.enabled ? "" : " (not on call)"}
          </option>
        ))}
    </select>
  );
}

function LeadDetail({ lead: l, pool, busy, act }: { lead: Lead; pool: PoolRow[]; busy: boolean; act: (label: string, body: Record<string, unknown>) => Promise<boolean> }) {
  const [note, setNote] = useState(l.admin_note ?? "");
  const closed = ["client", "no_fit", "stopped", "redirected"].includes(l.status);
  return (
    <div className="mb-3 rounded-lg bg-gray-50 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <a className="font-medium text-primary-700" href={`tel:${l.phone}`}>
          {phoneFmt(l.phone)}
        </a>
        {l.email && <span className="text-gray-600">{l.email}</span>}
        {l.zip && <span className="text-gray-600">ZIP {l.zip}</span>}
        {l.payment_type && <span className="text-gray-600">{PAY[l.payment_type] ?? l.payment_type}</span>}
        {l.utm_medium && <span className="text-gray-400">via {l.utm_medium}</span>}
      </div>
      {l.note && <p className="mt-2 rounded bg-white px-2.5 py-1.5 text-xs text-gray-700">“{l.note}”</p>}

      <ol className="mt-3 space-y-1 text-xs">
        {l.offers.length === 0 && <li className="text-gray-500">No offers yet.</li>}
        {l.offers.map((o) => {
          const state = o.accepted_at
            ? `accepted ${fmtTime(o.accepted_at)}`
            : o.declined_at
              ? `passed${o.decline_reason ? ` (${o.decline_reason})` : ""}`
              : o.expired_at
                ? "no reply in 30 min"
                : minsLeft(o.expires_at) >= 0
                  ? `waiting · ${minsLeft(o.expires_at)} min left`
                  : "past due";
          const isOpen = !o.accepted_at && !o.declined_at && !l.accepted_offer_id;
          return (
            <li key={o.id} className="flex flex-wrap items-center gap-2">
              <span className="text-gray-400">#{o.position}</span>
              <span className="font-medium text-gray-800">{o.provider?.display_name ?? o.provider_id.slice(0, 8)}</span>
              <span className={o.accepted_at ? "text-success-700" : "text-gray-600"}>{state}</span>
              <span className="text-gray-400">{fmtTime(o.offered_at)}</span>
              {isOpen && (
                <>
                  <button className="text-primary-700 underline-offset-2 hover:underline" disabled={busy} onClick={() => void act("Accept", { action: "accept", offerId: o.id })}>
                    they said yes by phone
                  </button>
                  <button className="text-gray-600 underline-offset-2 hover:underline" disabled={busy} onClick={() => void act("Skip", { action: "decline", offerId: o.id, reason: "other" })}>
                    skip
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ol>

      {!closed && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {!l.accepted_offer_id && (
            <>
              <button className={btn} disabled={busy} onClick={() => void act("Offer next", { action: "offer_next", leadId: l.id })}>
                Offer to next
              </button>
              <OfferTo lead={l} pool={pool} busy={busy} onPick={(pid) => void act("Offer", { action: "offer_to", leadId: l.id, providerId: pid })} />
            </>
          )}
          {l.accepted_offer_id && (
            <>
              {l.status !== "contacted" && (
                <button className={btnPri} disabled={busy} onClick={() => void act("Reached", { action: "set_status", leadId: l.id, status: "contacted" })}>
                  Reached
                </button>
              )}
              <button className={btn} disabled={busy} onClick={() => void act("Client", { action: "set_status", leadId: l.id, status: "client" })}>
                Became client
              </button>
              <button className={btn} disabled={busy} onClick={() => void act("No fit", { action: "set_status", leadId: l.id, status: "no_fit" })}>
                Not a fit
              </button>
              <button className={btn} disabled={busy} onClick={() => void act("Unreachable", { action: "set_status", leadId: l.id, status: "unreachable" })}>
                Unreachable
              </button>
            </>
          )}
          <button className={`${btn} text-gray-500`} disabled={busy} onClick={() => void act("Stop", { action: "set_status", leadId: l.id, status: "stopped" })}>
            Stop
          </button>
        </div>
      )}

      {(l.family_check_sent_at || l.outcome_ping_1_at) && (
        <ul className="mt-3 space-y-1 border-t border-gray-200 pt-3 text-xs text-gray-600">
          {l.family_check_sent_at && (
            <li>
              Asked {l.first_name} if they were called · {fmtTime(l.family_check_sent_at)}
              {l.family_check_reply === "reached" && <span className="ml-2 text-success-700">they said yes</span>}
              {l.family_check_reply === "not_yet" && <span className="ml-2 text-warm-700">they said not yet</span>}
              {!l.family_check_reply && <span className="ml-2 text-gray-400">no reply yet</span>}
            </li>
          )}
          {l.provider_nudged_at && <li>Nudged the provider · {fmtTime(l.provider_nudged_at)}</li>}
          {l.outcome_ping_1_at && (
            <li>
              Asked if they became a client · {fmtTime(l.outcome_ping_1_at)}
              {l.outcome_ping_2_at && <> and {fmtTime(l.outcome_ping_2_at)}</>}
              {l.outcome && <span className="ml-2 font-medium text-gray-800">answered: {l.outcome}</span>}
            </li>
          )}
        </ul>
      )}
      <div className="mt-3 flex items-center gap-2">
        <input className={`${input} w-full`} placeholder="a note for you" value={note} onChange={(e) => setNote(e.target.value)} />
        {note !== (l.admin_note ?? "") && (
          <button className={btn} disabled={busy} onClick={() => void act("Note", { action: "note", leadId: l.id, note })}>
            Save
          </button>
        )}
      </div>
    </div>
  );
}

function CityEditor({ slug, campaigns, pool, busy, act }: { slug: string; campaigns: Campaign[]; pool: PoolRow[]; busy: boolean; act: (label: string, body: Record<string, unknown>) => Promise<boolean> }) {
  const tag = campaigns[0]?.campaign_tag;
  return (
    <div className="mb-3 rounded-lg bg-gray-50 px-4 py-3 text-sm">
      <div className="mb-3 flex items-baseline justify-between gap-3 text-xs text-gray-600">
        <span>{campaigns[0]?.ring_label}</span>
        <a className="text-primary-700" href={`/care/${slug}?utm_source=olera_city&utm_medium=paid_search&utm_campaign=${tag}`} target="_blank" rel="noreferrer">
          /care/{slug} ↗
        </a>
      </div>

      <div className="divide-y divide-gray-200">
        {campaigns.map((c) => (
          <CampaignRow key={c.id} c={c} busy={busy} act={act} />
        ))}
      </div>

      <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wider text-gray-500">On call, in order · tick only after a written YES</p>
      <div className="divide-y divide-gray-200">
        {pool.map((p) => (
          <PoolLine key={p.id} p={p} busy={busy} act={act} />
        ))}
      </div>
    </div>
  );
}

function CampaignRow({ c, busy, act }: { c: Campaign; busy: boolean; act: (label: string, body: Record<string, unknown>) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [spend, setSpend] = useState("");
  const [clicks, setClicks] = useState("");
  const [impr, setImpr] = useState("");
  const [pid, setPid] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const typed = c.ad_spend_cents !== null || c.ad_clicks !== null || c.ad_impressions !== null;

  const begin = () => {
    setSpend(c.ad_spend_cents === null ? "" : (c.ad_spend_cents / 100).toFixed(2));
    setClicks(c.ad_clicks === null ? "" : String(c.ad_clicks));
    setImpr(c.ad_impressions === null ? "" : String(c.ad_impressions));
    setEditing(true);
  };
  const save = async () => {
    const ok = await act("Metrics", {
      action: "update_campaign",
      id: c.id,
      fields: {
        ad_spend_cents: spend === "" ? "" : Math.round(parseFloat(spend) * 100),
        ad_clicks: clicks === "" ? "" : parseInt(clicks, 10),
        ad_impressions: impr === "" ? "" : parseInt(impr, 10),
        ...(pid !== null ? { platform_campaign_id: pid } : {}),
      },
    });
    if (ok) setEditing(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
      <span className="w-40 font-medium text-gray-900">
        {cap(c.channel)} · {money(c.budget_cents)}
        {c.max_cpc_cents ? ` · ${money(c.max_cpc_cents)} cap` : ""}
      </span>
      <span className="relative">
        <button type="button" onClick={() => setMenu((m) => !m)} className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${c.status === "live" ? "bg-primary-100 text-primary-800" : "bg-gray-200 text-gray-700"}`}>
          {c.status}
        </button>
        {menu && (
          <span className="absolute left-0 top-6 z-10 w-32 overflow-hidden rounded-lg border border-gray-200 bg-white text-xs shadow-lg">
            {["draft", "scheduled", "live", "ended"].map((s) => (
              <button
                key={s}
                type="button"
                className={`block w-full px-3 py-1.5 text-left hover:bg-gray-50 ${s === c.status ? "bg-primary-50 font-semibold" : ""}`}
                onClick={() => {
                  setMenu(false);
                  if (s !== c.status) void act("Status", { action: "update_campaign", id: c.id, fields: { status: s } });
                }}
              >
                {s}
              </button>
            ))}
          </span>
        )}
      </span>
      <span className="text-xs text-gray-600">
        {c.flight_start} to {c.flight_end}
      </span>
      <span className="ml-auto text-xs text-gray-600">
        {editing ? (
          <span className="flex flex-wrap items-center gap-1.5">
            <input className={`${input} w-20`} placeholder="$ spend" value={spend} onChange={(e) => setSpend(e.target.value)} disabled={busy} />
            <input className={`${input} w-16`} placeholder="clicks" value={clicks} onChange={(e) => setClicks(e.target.value)} disabled={busy} />
            <input className={`${input} w-16`} placeholder="impr" value={impr} onChange={(e) => setImpr(e.target.value)} disabled={busy} />
            <input className={`${input} w-28`} placeholder="platform id" value={pid ?? c.platform_campaign_id ?? ""} onChange={(e) => setPid(e.target.value)} disabled={busy} />
            <button className={btnPri} disabled={busy} onClick={() => void save()}>
              Save
            </button>
            <button className={btn} disabled={busy} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </span>
        ) : typed ? (
          <>
            {money(c.ad_spend_cents) || "$—"} · {c.ad_clicks ?? "—"} clicks · {c.ad_impressions ?? "—"} impr <span className="text-gray-400">{ago(c.metrics_updated_at)}</span>{" "}
            <button className="font-medium text-primary-700" onClick={begin}>
              edit
            </button>
          </>
        ) : (
          <button className="font-medium text-primary-700" onClick={begin}>
            enter spend and clicks
          </button>
        )}
      </span>
    </div>
  );
}

function PoolLine({ p, busy, act }: { p: PoolRow; busy: boolean; act: (label: string, body: Record<string, unknown>) => Promise<boolean> }) {
  const [ovr, setOvr] = useState<string | null>(null); // null = not editing
  const current = p.phone_override ?? "";
  return (
    <div className="py-2">
      <label className="flex items-center gap-2.5">
        <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={p.enabled} disabled={busy} onChange={(e) => void act("On call", { action: "pool_toggle", poolId: p.id, enabled: e.target.checked })} />
        <span className={`font-medium ${p.enabled ? "text-gray-900" : "text-gray-500"}`}>{p.provider?.display_name ?? p.provider_id.slice(0, 8)}</span>
        <span className="text-xs text-gray-500">
          {p.provider?.city} · {p.care_types.map((t) => CARE[t] ?? t).join(", ")}
        </span>
        <span className="ml-auto text-xs text-gray-600">{p.provider?.email ?? <span className="text-warm-700">no email on file</span>}</span>
      </label>
      {p.enabled && (
        <div className="ml-6 mt-1 text-xs text-gray-500">
          Offers go by email to {p.provider?.email ?? "nobody (add an email)"}, and by text to {phoneFmt(p.phone_override ?? p.provider?.phone) || "no number"} if it can take one.{" "}
          {ovr === null ? (
            <button className="text-primary-700" onClick={() => setOvr(current)}>
              {current ? "change" : "Different mobile?"}
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <input className={`${input} w-36`} placeholder="(704) 555-0100" value={ovr} onChange={(e) => setOvr(e.target.value)} disabled={busy} />
              <button
                className={btnPri}
                disabled={busy}
                onClick={async () => {
                  if (await act("Mobile", { action: "pool_update", poolId: p.id, fields: { phone_override: ovr } })) setOvr(null);
                }}
              >
                Save
              </button>
              <button className={btn} disabled={busy} onClick={() => setOvr(null)}>
                Cancel
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

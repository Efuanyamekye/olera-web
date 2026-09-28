"use client";

import MetaNativeStatus from "@/components/admin/MetaNativeStatus";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { citySendWindow } from "@/lib/city-ads/send-window";
import CityQuizFunnel from "@/components/admin/CityQuizFunnel";
import type { ArmRow } from "@/lib/city-ads/arm-rollup";
import type { CityLandingArm } from "@/lib/city-ads/landing-variant";

/** Opening the page is the fastest way to know what a number means. */
const CITY_PREVIEWS = [
  { slug: "dallas-tx", label: "Dallas" },
  { slug: "charlotte-nc", label: "Charlotte" },
] as const;

/** What each arm is, in the words used to describe it everywhere else. */
const ARM_LABEL: Partial<Record<CityLandingArm, string>> = {
  providers_first: "Providers first",
  one_screen: "One screen",
  guidance: "Find a starting point",
  control: "Control",
};

/**
 * /admin/city-ads — Olera-owned city campaigns.
 *
 * Four blocks, one column, one question each:
 *   Needs you  — leads waiting on a human (unfilled, offer past due, parked past
 *                its morning). Empty most days; when not, first on the page.
 *   Leads      — one line each: who, what, who has it. Tap to open the chain
 *                and the outcome buttons.
 *   Setup      — one line per city. Everything editable lives behind "edit".
 *   Quiz       — paid entry cohorts, quiz starts and contact-step reach.
 *
 * Nothing is an input at rest.
 *
 * Cost per ACCEPTED FAMILY and the family-side conversion rate are still not
 * here by design. Cost per LEAD PER CHANNEL now is, in the Setup block: the
 * city arms are a platform experiment before they are a lead source, Charlotte
 * runs Google, Nextdoor and Meta at once, and that number is what decides which
 * platform we keep. It sits next to the spend fields because it is computed
 * from them the moment they are typed. (The day-5/day-14 Slack reads this page
 * originally deferred those numbers to were never built, so until they are,
 * deferring here means no read at all.)
 *
 * Design pass: https://claude.ai/code/artifact/8faff70d-8262-4ad1-be62-748c0eb13493
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
  /**
   * The campaign's running narrative: what was built and why, what we are
   * seeing, and what has already been ruled out. Same role as `admin_note` on
   * an Ad Boost row. It exists to stop a later session re-deriving a diagnosis
   * that was reached and discarded once already, so it is shown here rather
   * than only living in the database.
   */
  admin_note: string | null;
};

type ChannelRow = {
  slug: string;
  channel: string;
  status: string;
  budgetCents: number | null;
  spendCents: number | null;
  clicks: number | null;
  leads: number;
  costPerLeadCents: number | null;
  clickToLead: number | null;
};

type Provider = { id: string; display_name: string | null; city: string | null; phone: string | null; email: string | null } | null;
type PoolRow = { id: string; slug: string; provider_id: string; position: number; care_types: string[]; enabled: boolean; is_test: boolean; phone_override: string | null; provider: Provider };
type Offer = { id: string; provider_id: string; position: number; offered_at: string; expires_at: string; accepted_at: string | null; declined_at: string | null; decline_reason: string | null; expired_at: string | null; reached_channels: string[] | null; delivery_note: string | null; provider: Provider };
type FamilyText = { id: string; created_at: string; email_type: string; status: string; html_body: string | null };
type InboundText = { id: string; created_at: string; body: string | null };
type Lead = {
  is_test?: boolean;
  capture_method?: string;
  meta_lead_id?: string | null;
  meta_form_id?: string | null;
  meta_campaign_id?: string | null;
  handed_at?: string | null;
  consent_form_version?: string;
  consent_at?: string;
  id: string;
  slug: string;
  archived_at: string | null;
  archive_reason: string | null;
  messages: {id:string;channel:string;body:string;subject:string|null;status:string;send_after:string;last_error:string|null}[];
  inbound?: InboundText[];
  qualification_verdict?: string | null;
  qualification_verdict_category?: string | null;
  qualification_verdict_reason?: string | null;
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
  /**
   * The family's care seeker profile. Every lead gets one at submit, so this is
   * null only for rows captured before migration 217. It is the lead's way out
   * of this queue: the profile page carries the comms timeline, the enrichment
   * fields worth filling on a concierge call, and the delete — and the FK
   * cascades, so deleting there clears the lead too.
   */
  care_seeker_id: string | null;
  qualification_reply: string | null;
  qualification_reply_at: string | null;
  qualification_escalated_at: string | null;
  offers: Offer[];
  texts: FamilyText[];
};


const CARE: Record<string, string> = { home_care: "help at home", assisted_living: "assisted living", unsure: "not sure yet", medical: "medical (redirected)" };
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

/**
 * A Meta form lead we have asked who needs care and not heard back from. The
 * form collects name, phone and ZIP and nothing else, so until this is answered
 * the lead is a blank one and the relay will not route it on its own.
 */
const awaitingQualification = (l: Lead) =>
  l.capture_method === "meta_instant_form" && !l.qualification_reply_at && !l.accepted_offer_id;

/**
 * Providers whose offers have never once arrived.
 *
 * This is the check that would have caught it on day one instead of day three.
 * A provider can sit "on call", take their place in the rotation and have the
 * clock run against them while every message we send is silently dropped,
 * because a landline cannot receive a text and a suppressed email address
 * writes no failure anywhere. Nothing on this page distinguished that from a
 * provider who was simply slow.
 */
function unreachableProviders(leads: Lead[]): Map<string, string> {
  const tried = new Map<string, { reached: boolean; note: string | null }>();
  for (const l of leads) {
    for (const o of l.offers) {
      const prev = tried.get(o.provider_id);
      const reached = (o.reached_channels?.length ?? 0) > 0;
      tried.set(o.provider_id, { reached: (prev?.reached ?? false) || reached, note: prev?.note ?? o.delivery_note });
    }
  }
  const out = new Map<string, string>();
  for (const [id, v] of tried) {
    if (!v.reached) out.set(id, v.note ?? "no offer has ever reached them");
  }
  return out;
}

/**
 * An offer nobody actually received.
 *
 * `offered_at` says we tried. It does not say it arrived, and for two days
 * those were read as the same thing: every Dallas provider number is a
 * landline so every offer text was skipped, and two of the three have info@
 * addresses cached invalid, whose suppression writes no record at all. Four of
 * the first seven offers reached nobody, while the panel showed a 30 minute
 * clock and then "no one on call took it".
 */
function reachedNobody(o: Offer): boolean {
  return (o.reached_channels?.length ?? 0) === 0;
}

/** Offers on this lead that were never delivered to anyone. */
function silentOffers(l: Lead): Offer[] {
  return l.offers.filter(reachedNobody);
}

/** Why a lead is in "Needs you", or null. */
function needsReason(l: Lead): string | null {
  if(l.archived_at || ["stopped","client","no_fit","redirected"].includes(l.status)) return null;
  // Handed to the provider whose ad it came from. She leads, we can still
  // follow up, so it is never "nobody has this" and never in Needs you.
  if (l.handed_at) return null;
  // Before the other "call them" rules: an unanswered Meta lead is waiting on
  // the family for its first hour, not on you, and saying otherwise every five
  // minutes is how a queue stops meaning anything.
  if (awaitingQualification(l)) return l.qualification_escalated_at ? "no answer to the qualifying text — call them" : null;
  if (l.status === "new" && !l.accepted_offer_id && l.offers.length === 0) return "call them — concierge city, no chain runs";
  // Ahead of every timing rule below. A clock running against a provider who
  // was never told is not a provider taking their time, and the fix is a
  // different one: correct their details, or offer it to somebody reachable.
  // A silent offer earlier in the chain is history once a LIVE offer has
  // actually reached somebody: that provider has it, their clock is running,
  // and there is nothing for a person to do yet. Flagging it anyway would put
  // a false job on the very list this page exists to keep true.
  const silent = silentOffers(l);
  const live = openOffer(l);
  const liveAndReached = Boolean(live) && !reachedNobody(live!);
  if (silent.length > 0 && !l.accepted_offer_id && !liveAndReached) {
    const who = silent.map((o) => o.provider?.display_name ?? "a provider").join(", ");
    // Every other line in this list ends in something to do. Naming the
    // providers and stopping leaves the reader to work out whether the family
    // is still covered, and the answer differs: if someone reachable has it,
    // the job is to re-route; if nobody does, the family is waiting on a call
    // that no provider is coming to make.
    return l.offers.length > silent.length
      ? `${who} never received this request — offer it to someone reachable`
      : `NOBODY WAS REACHED — call them, and fix ${who}`;
  }
  // Two different facts wore the same label. With an empty pool nobody was
  // ever asked, and telling the caller "no one took it" sends them looking for
  // a provider who declined.
  if (l.status === "unfilled") {
    if (l.offers.length === 0) return "nobody is switched on in this city yet — call them";
    const reached = l.offers.filter((o) => !reachedNobody(o)).length;
    // "No one took it" is only true of providers who were actually asked.
    return reached === 0
      ? "no provider was ever reached — call them, and fix the pool"
      : `no one on call took it (${reached} of ${l.offers.length} actually received it)`;
  }
  if (l.family_check_reply === "not_yet" && !l.reached_at) return "family says the provider has not called";
  const o = openOffer(l);
  if (o && minsLeft(o.expires_at) < 0) return `offer to ${o.provider?.display_name ?? "a provider"} is past its window`;
  if (l.status === "new" && l.next_offer_at && new Date(l.next_offer_at) < new Date()) return "parked past its morning and not offered";
  return null;
}

export default function CityAdsAdminPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [rollup, setRollup] = useState<ChannelRow[]>([]);
  const [armRollup, setArmRollup] = useState<ArmRow[]>([]);
  const [pool, setPool] = useState<PoolRow[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [lastClockRun, setLastClockRun] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [openCity, setOpenCity] = useState<string | null>(null);
  const [, setTick] = useState(0);

  // Computed from the offers already on the page, so it costs no extra query
  // and can never disagree with the rows underneath it.
  const unreachable = useMemo(() => unreachableProviders(leads), [leads]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/city-ads", { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const d = await res.json();
      setCampaigns(d.campaigns);
      setRollup(d.channelRollup ?? []);
      setArmRollup(d.armRollup ?? []);
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
      // An action that has something specific to report says so itself (a
      // suppressed number, who was texted). Falling back to "done" would hide it.
      flash(d.message ?? (d.result?.providerName ? `${label}: ${d.result.providerName}` : `${label}: done`), d.message ? 5000 : undefined);
      await load();
      return true;
    } catch (e) {
      flash(`${label} failed: ${e instanceof Error ? e.message : "error"}`, 6000);
      return false;
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

  const readout = useMemo(() => cityReadout(campaigns, leads), [campaigns, leads]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      {error && <div className="mb-4 rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">{error}</div>}
      {toast && <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>}

      {/* The sentence: how many families, and the one thing that needs you.
          Built from fixed rules over the same rows drawn below (cityReadout),
          never generated, so it cannot say something the rows do not. */}
      <header>
        <p className="text-sm text-gray-600">
          {today}
          {lastClockRun && <span className="text-gray-400"> · clock ran {ago(lastClockRun)}</span>}
        </p>
        <h1 className="mt-2 font-display text-[34px] leading-[1.08] text-gray-950 sm:text-[42px]" style={{ textWrap: "balance" }}>
          {readout.families} {readout.families === 1 ? "family" : "families"} found, {readout.headline}
        </h1>
        <p className="mt-2 text-[15px] text-gray-600">
          Across {readout.rows.length} {readout.rows.length === 1 ? "city" : "cities"} since launch. {liveCount} ads live, {onCall} providers on call.
        </p>
      </header>

      <div className="mt-8">
        {readout.rows.map((r) => (
          <div
            key={r.slug}
            className={`grid grid-cols-1 gap-x-5 gap-y-1 px-4 py-4 sm:grid-cols-[150px_1fr_auto] sm:items-center ${
              r.lit ? "rounded-2xl bg-primary-950 text-white" : "border-t border-gray-100 first:border-t-0"
            }`}
          >
            <span className="font-semibold">{r.city}</span>
            <span className={r.lit ? "text-white/80" : "text-gray-600"}>{r.say}</span>
            <span className="tabular-nums sm:text-right">
              {r.families} {r.families === 1 ? "family" : "families"}
              <span className={`block text-xs ${r.lit ? "text-white/70" : "text-gray-400"}`}>{r.cost}</span>
            </span>
          </div>
        ))}
      </div>

      {readout.spendMissing && (
        <p className="mt-3 text-xs text-gray-400">
          Cost per family shows once every ad&rsquo;s spend is recorded. Meta and Nextdoor spend isn&rsquo;t synced yet.
        </p>
      )}

      {readout.arrivals.length > 0 && (
        <div className="mt-10">
          <p className="mb-2 text-xs font-semibold text-gray-400">Arriving from the ads · each name opens the family</p>
          <div className="grid grid-cols-2 border-y border-gray-100 sm:grid-cols-5">
            {readout.arrivals.map((a, i) => (
              <div key={a.id} className={`flex flex-col gap-0.5 py-3 pr-3 ${i % 5 !== 0 ? "sm:border-l sm:border-gray-100 sm:pl-4" : ""}`}>
                {a.href ? (
                  <Link href={a.href} className="font-semibold text-gray-900 underline-offset-2 hover:underline">
                    {a.name}
                  </Link>
                ) : (
                  <span className="font-semibold text-gray-900">{a.name}</span>
                )}
                <span className="text-xs text-gray-400">
                  {a.city} · {a.when}
                </span>
                <span className="text-xs text-gray-600">{a.standing}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <Link href="/admin/relationships/families?tab=call" className="text-gray-700 underline decoration-gray-300 underline-offset-4 hover:text-gray-900">
          {needs.length} {needs.length === 1 ? "family needs" : "families need"} a call
        </Link>
        <Link href="/admin/ad-boost" className="text-gray-700 underline decoration-gray-300 underline-offset-4 hover:text-gray-900">
          Provider campaigns
        </Link>
      </div>

      {/* Everything below is for changing things, not for a daily look. */}
      <div className="mt-12 space-y-3">
        <Fold title="Landing-page test and quiz">
          <LandingArms rows={armRollup} />
          <div className="mt-6">
            <CityQuizFunnel />
          </div>
        </Fold>
        <Fold title="Meta forms and system health">
          <MetaNativeStatus />
        </Fold>
        <Fold title="Setup: cities, spend, providers on call">
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
                        {cs.map((c) => `${cap(c.channel)} ${c.status}`).join(" · ")} · {enabled} on call · {latestTyped ? `spend updated ${ago(latestTyped)}` : "spend not recorded yet"}
                      </div>
                    </div>
                    <button className={btn} onClick={() => setOpenCity(open ? null : slug)}>
                      {open ? "close" : "edit"}
                    </button>
                  </div>
                  {open && <CityEditor slug={slug} campaigns={cs} rollup={rollup.filter((r) => r.slug === slug)} pool={ps} unreachable={unreachable} busy={busy} act={act} />}
                </div>
              );
            })}
          </div>
        </Fold>
      </div>
    </div>
  );
}

function Fold({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-xl border border-gray-200 bg-white">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-gray-700 hover:text-gray-900">
        <span className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>
        {title}
      </summary>
      <div className="border-t border-gray-100 px-4 py-4">{children}</div>
    </details>
  );
}

/** Calendar days between two instants, counted in US Eastern, as the team reads them. */
function etDayGap(fromMs: number, toMs: number): number {
  const day = (ms: number) => new Date(new Date(ms).toLocaleDateString("en-US", { timeZone: "America/New_York" })).getTime();
  return Math.round((day(toMs) - day(fromMs)) / 86_400_000);
}

function relDay(gapDays: number, iso?: string): string {
  if (gapDays === 0) return "today";
  if (gapDays === 1) return iso ? "tomorrow" : "yesterday";
  if (iso) return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });
  return `${gapDays} days ago`;
}

const CHANNEL_WORD: Record<string, string> = { google: "Google ad", meta: "Facebook ad", nextdoor: "Nextdoor ad" };
const DAY = 86_400_000;

/**
 * The top of the page as data: the sentence, one row per city with at most one
 * lit, and the latest arrivals. Fixed rules, checked in order; the first that
 * is true writes the sentence AND lights its city's row, so the two can never
 * disagree.
 *   1. A live ad has found nobody for 3 days      -> "one ad has gone quiet."
 *   2. A family says their provider has not called -> "{name} is still waiting for a call."
 *   3. A family was offered and nobody took it     -> "{name} needs a provider."
 *   4. A flight ends within 2 days                 -> "{City} ends {day}."
 *   5. None of the above                           -> "every ad is finding families."
 */
function cityReadout(campaigns: Campaign[], leads: Lead[]) {
  const now = Date.now();
  const real = leads.filter((l) => !l.is_test && !l.archived_at);
  const slugs = Array.from(new Set(campaigns.map((c) => c.slug)));
  const cityOf = (slug: string) => campaigns.find((c) => c.slug === slug)?.city ?? slug;
  const running = (c: Campaign) => c.status === "live" && (!c.flight_end || new Date(`${c.flight_end}T23:59:59`).getTime() >= now);
  const leadsFor = (c: Campaign) =>
    leads.filter((l) =>
      !l.is_test &&
      (c.platform_campaign_id && l.meta_campaign_id
        ? l.meta_campaign_id === c.platform_campaign_id
        : l.slug === c.slug && l.utm_medium === c.utm_medium),
    );

  type Fired = { slug: string; headline: string; say: string };
  const fired: Fired[] = [];
  for (const c of campaigns.filter(running)) {
    const started = c.flight_start ? new Date(c.flight_start).getTime() : now;
    const ls = leadsFor(c);
    const last = ls.map((l) => new Date(l.created_at).getTime()).sort((a, b) => b - a)[0] ?? started;
    const quietDays = Math.floor((now - last) / DAY);
    const endsSoon = c.flight_end ? new Date(`${c.flight_end}T23:59:59`).getTime() - now <= DAY : false;
    if (now - started >= 3 * DAY && quietDays >= 3 && !endsSoon) {
      const ends = c.flight_end ? ` It stops ${new Date(`${c.flight_end}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.` : "";
      fired.push({
        slug: c.slug,
        headline: "one ad has gone quiet.",
        say: `The ${CHANNEL_WORD[c.channel] ?? "ad"} found ${ls.length}, then nothing for ${quietDays} days.${ends}`,
      });
    }
  }
  for (const l of real) {
    if (l.family_check_reply === "not_yet" && !l.reached_at) {
      fired.push({ slug: l.slug, headline: `${firstName(l.first_name)} is still waiting for a call.`, say: `${firstName(l.first_name)} says the provider hasn't called.` });
    }
  }
  for (const l of real) {
    if (l.status === "unfilled") {
      fired.push({ slug: l.slug, headline: `${firstName(l.first_name)} needs a provider.`, say: `${firstName(l.first_name)} was offered and nobody took it.` });
    }
  }
  for (const c of campaigns.filter(running)) {
    if (c.flight_end) {
      const end = new Date(`${c.flight_end}T23:59:59`).getTime();
      if (end - now <= 2 * DAY) {
        const day = relDay(etDayGap(now, new Date(`${c.flight_end}T12:00:00`).getTime()), c.flight_end);
        fired.push({ slug: c.slug, headline: `${cityOf(c.slug)} ends ${day}.`, say: `The ${CHANNEL_WORD[c.channel] ?? "ad"} ends ${day}.` });
      }
    }
  }
  const top = fired[0] ?? null;

  const rows = slugs.map((slug) => {
    const fams = real.filter((l) => l.slug === slug);
    const cs = campaigns.filter((c) => c.slug === slug);
    const spendKnown = cs.every((c) => c.status === "draft" || c.ad_spend_cents != null);
    const spend = cs.reduce((sum, c) => sum + (c.ad_spend_cents ?? 0), 0);
    const cost = spendKnown && fams.length > 0 && spend > 0 ? `about $${Math.round(spend / 100 / fams.length)} each` : "";
    const mine = fired.find((f) => f.slug === slug);
    const lastAt = fams.map((l) => new Date(l.created_at).getTime()).sort((a, b) => b - a)[0];
    return {
      slug,
      city: cityOf(slug),
      families: fams.length,
      cost,
      lit: top?.slug === slug,
      say:
        mine?.say ??
        (lastAt
          ? `Last family arrived ${relDay(Math.max(0, etDayGap(lastAt, now)))}.`
          : "No families yet."),
    };
  });
  rows.sort((a, b) => Number(b.lit) - Number(a.lit) || b.families - a.families);

  const standing = (l: Lead): string => {
    const accepted = l.offers.find((o) => o.accepted_at);
    if (l.outcome === "client" || l.status === "client") return "Became a client";
    if (l.status === "no_fit") return "Not a fit";
    if (l.handed_at) return "With the campaign's provider";
    if (accepted) return `Accepted by ${accepted.provider?.display_name ?? "a provider"}`;
    if (l.status === "unfilled") return "No provider took it";
    if (l.status === "contacted") return "Reached";
    if (l.qualification_reply_at) return "Replied";
    return "No reply to our text";
  };
  const arrivals = [...real]
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    .slice(0, 5)
    .map((l) => ({
      id: l.id,
      name: firstName(l.first_name),
      city: cityOf(l.slug),
      when: new Date(l.created_at).toLocaleDateString("en-US", { weekday: "short", timeZone: "America/New_York" }),
      standing: standing(l),
      href: l.care_seeker_id ? `/admin/relationships/families/${l.care_seeker_id}` : null,
    }));

  return {
    families: real.length,
    headline: top?.headline ?? "every ad is finding families.",
    spendMissing: slugs.some((slug) => campaigns.some((c) => c.slug === slug && c.status !== "draft" && c.ad_spend_cents == null)),
    rows,
    arrivals,
  };
}

function firstName(name: string | null): string {
  return String(name ?? "").trim().split(/\s+/)[0] || "A family";
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

function CityEditor({ slug, campaigns, rollup, pool, unreachable, busy, act }: { slug: string; campaigns: Campaign[]; rollup: ChannelRow[]; pool: PoolRow[]; unreachable: Map<string, string>; busy: boolean; act: (label: string, body: Record<string, unknown>) => Promise<boolean> }) {
  const tag = campaigns[0]?.campaign_tag;
  return (
    <div className="mb-3 rounded-lg bg-gray-50 px-4 py-3 text-sm">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs text-gray-600">
        <span>{campaigns[0]?.ring_label}</span>
        {/* One preview link per channel, each carrying that channel's own
            utm_medium. A single hardcoded paid_search link was fine when Google
            was the only arm; with three it would test the page under the wrong
            attribution and quietly file the visit against Google. */}
        <span className="flex flex-wrap gap-x-3">
          {campaigns.map((c) => (
            <a
              key={c.id}
              className="text-primary-700"
              href={`/care/${slug}?utm_source=olera_city&utm_medium=${c.utm_medium}&utm_campaign=${tag}`}
              target="_blank"
              rel="noreferrer"
            >
              /care/{slug} as {cap(c.channel)} ↗
            </a>
          ))}
        </span>
      </div>

      <ChannelCompare rows={rollup} />

      <div className="divide-y divide-gray-200">
        {campaigns.map((c) => (
          <CampaignRow key={c.id} c={c} busy={busy} act={act} />
        ))}
      </div>

      <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wider text-gray-500">On call, in order · tick only after a written YES</p>
      <div className="divide-y divide-gray-200">
        {pool.map((p) => (
          <PoolLine key={p.id} p={p} unreachable={unreachable.get(p.provider_id)} busy={busy} act={act} />
        ))}
      </div>
    </div>
  );
}

/**
 * Cost per lead per channel — the number that decides which platform survives.
 *
 * Spend and clicks are hand-typed from the ad manager, leads are computed, so
 * the two halves fill in at different times. Where a number cannot be computed
 * honestly it says so rather than printing a confident zero: a channel showing
 * "$0.00 per lead" because nobody typed the spend yet is worse than a channel
 * showing nothing, because it reads as a result.
 */
/**
 * The landing-page experiment, per arm.
 *
 * Submissions is the only column that decides. Landings is the denominator and
 * engagement says where an arm loses people; neither picks a winner, and at
 * roughly 150 visits an arm nothing here can rank two arms that both work.
 *
 * The preview links are the other half of the job: the fastest way to know what
 * a number means is to open the page that produced it.
 */
function LandingArms({ rows }: { rows: ArmRow[] }) {
  const any = rows.some((r) => r.landings > 0);
  return (
    <section className="mb-8">
      <Eyebrow>Landing pages</Eyebrow>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-[11px] uppercase tracking-wider text-gray-500">
            <tr>
              <th className="py-1 pr-3 font-semibold">Arm</th>
              <th className="py-1 pr-3 text-right font-semibold">Landings</th>
              <th className="py-1 pr-3 text-right font-semibold">Engaged</th>
              <th className="py-1 pr-3 text-right font-semibold">Requests</th>
              <th className="py-1 text-right font-semibold">Per landing</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 text-gray-800">
            {rows.map((r) => (
              <tr key={r.arm}>
                <td className="py-1.5 pr-3 font-medium text-gray-900">
                  {ARM_LABEL[r.arm] ?? r.arm}{" "}
                  {/* Both cities run all three arms, and the numbers in this row
                      pool them. A single unlabelled "open" implied one city. */}
                  {CITY_PREVIEWS.map((c) => (
                    <a
                      key={c.slug}
                      className="ml-1.5 font-normal text-primary-700 underline-offset-2 hover:underline"
                      href={`/care/${c.slug}?v=${r.arm}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {c.label}
                    </a>
                  ))}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{r.landings}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  {r.engaged}
                  {r.engagementRate !== null && r.landings > 0 && (
                    <span className="text-gray-400"> ({(r.engagementRate * 100).toFixed(0)}%)</span>
                  )}
                </td>
                <td className="py-1.5 pr-3 text-right font-semibold tabular-nums text-gray-900">{r.submissions}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {r.submissionRate === null ? (
                    <span className="text-gray-400">—</span>
                  ) : (
                    `${(r.submissionRate * 100).toFixed(1)}%`
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-gray-500">
        {any
          ? "Requests is the number that decides. Engagement says where an arm loses people. At this traffic a one-request gap is noise, and there is no control — this says which new page is best, not that it beat the old one."
          : "Nothing has landed on the new pages yet."}
      </p>
    </section>
  );
}

function ChannelCompare({ rows }: { rows: ChannelRow[] }) {
  if (rows.length === 0) return null;
  const anyLeads = rows.some((r) => r.leads > 0);
  return (
    <div className="mb-3 overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-[11px] uppercase tracking-wider text-gray-500">
          <tr>
            <th className="py-1 pr-3 font-semibold">Channel</th>
            <th className="py-1 pr-3 text-right font-semibold">Spend</th>
            <th className="py-1 pr-3 text-right font-semibold">Clicks</th>
            <th className="py-1 pr-3 text-right font-semibold">Leads</th>
            <th className="py-1 pr-3 text-right font-semibold">Per lead</th>
            <th className="py-1 text-right font-semibold">Click → lead</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 text-gray-800">
          {rows.map((r) => (
            <tr key={`${r.slug}-${r.channel}`}>
              <td className="py-1.5 pr-3 font-medium text-gray-900">
                {r.channel === "meta_instant_form" ? "Meta Instant Form" : cap(r.channel)} <span className="font-normal text-gray-500">{r.status}</span>
              </td>
              <td className="py-1.5 pr-3 text-right tabular-nums">
                {r.spendCents === null ? <span className="text-gray-400">not typed</span> : money(r.spendCents)}
              </td>
              <td className="py-1.5 pr-3 text-right tabular-nums">
                {r.clicks === null ? <span className="text-gray-400">—</span> : r.clicks}
              </td>
              <td className="py-1.5 pr-3 text-right font-medium tabular-nums">{r.leads}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">
                {r.costPerLeadCents === null ? <span className="text-gray-400">—</span> : money(r.costPerLeadCents)}
              </td>
              <td className="py-1.5 text-right tabular-nums">
                {r.clickToLead === null ? <span className="text-gray-400">—</span> : `${(r.clickToLead * 100).toFixed(1)}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!anyLeads && (
        <p className="mt-1.5 text-[11px] text-gray-500">
          No leads attributed yet. Type spend and clicks on a channel below and cost per lead fills in here.
        </p>
      )}
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
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState<string | null>(null); // null = reading, not editing
  const typed = c.ad_spend_cents !== null || c.ad_clicks !== null || c.ad_impressions !== null;
  const note = c.admin_note ?? "";

  const saveNote = async () => {
    const ok = await act("Note", {
      action: "update_campaign",
      id: c.id,
      fields: { admin_note: noteDraft ?? "" },
    });
    if (ok) setNoteDraft(null);
  };

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
    <div className="py-2.5">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
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
        {" · "}
        <button className="font-medium text-primary-700" onClick={() => setNoteOpen((o) => !o)}>
          {noteOpen ? "hide notes" : note ? "notes" : "add notes"}
        </button>
      </span>
    </div>

    {noteOpen && (
      <div className="mt-2 border-l-2 border-gray-200 pl-3">
        {noteDraft === null ? (
          <>
            {note ? (
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-gray-700">{note}</p>
            ) : (
              <p className="text-xs italic text-gray-500">
                No notes yet. Record what was built and why, what you are seeing, and what has already been ruled out.
              </p>
            )}
            <button className="mt-1.5 text-xs font-medium text-primary-700" onClick={() => setNoteDraft(note)}>
              {note ? "edit" : "write one"}
            </button>
          </>
        ) : (
          <>
            <textarea
              className={`${input} h-64 w-full font-mono text-xs leading-relaxed`}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              disabled={busy}
            />
            <div className="mt-1.5 flex gap-1.5">
              <button className={btnPri} disabled={busy} onClick={() => void saveNote()}>
                Save
              </button>
              <button className={btn} disabled={busy} onClick={() => setNoteDraft(null)}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    )}
    </div>
  );
}

function PoolLine({ p, unreachable, busy, act }: { p: PoolRow; unreachable?: string; busy: boolean; act: (label: string, body: Record<string, unknown>) => Promise<boolean> }) {
  const [ovr, setOvr] = useState<string | null>(null); // null = not editing
  const [rank, setRank] = useState(String(p.position));
  const current = p.phone_override ?? "";
  // Lower goes first. Saved on blur rather than per keystroke, so typing "25"
  // does not briefly write a 2 and reshuffle the queue under a live lead.
  const saveRank = async () => {
    const next = Number(rank);
    if (!Number.isFinite(next) || next <= 0 || next === p.position) {
      setRank(String(p.position));
      return;
    }
    if (!(await act("Rank", { action: "pool_update", poolId: p.id, fields: { position: next } }))) {
      setRank(String(p.position));
    }
  };
  return (
    <div className="py-2">
      <div className="flex items-center gap-2.5">
        <label className="flex items-center gap-2.5">
          <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={p.enabled} disabled={busy} onChange={(e) => void act("On call", { action: "pool_toggle", poolId: p.id, enabled: e.target.checked })} />
          <span className={`font-medium ${p.enabled ? "text-gray-900" : "text-gray-500"}`}>{p.provider?.display_name ?? p.provider_id.slice(0, 8)}</span>
        </label>
        {p.is_test && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">test</span>}
        {unreachable && <span className="rounded bg-error-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-error-700">cannot be reached</span>}
        <span className="text-xs text-gray-500">
          {p.provider?.city} · {p.care_types.map((t) => CARE[t] ?? t).join(", ")}
        </span>
        <span className="inline-flex items-center gap-1 text-xs text-gray-500" title="Order offers are made in. Lower goes first.">
          <span className="text-gray-400">rank</span>
          <input
            type="number"
            min={1}
            className="w-14 rounded border border-gray-300 px-1.5 py-0.5 text-xs tabular-nums"
            value={rank}
            disabled={busy}
            onChange={(e) => setRank(e.target.value)}
            onBlur={() => void saveRank()}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          />
        </span>
        <span className="ml-auto text-xs text-gray-600">{p.provider?.email ?? <span className="text-warm-700">no email on file</span>}</span>
      </div>
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

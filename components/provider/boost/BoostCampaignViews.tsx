"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  boostChannelLabel,
  type BoostRequest,
  type CampaignReceiptData,
} from "@/lib/ad-boost/boost-state";
import {
  BUDGET_STOPS,
  CUSTOM_SCALE_STOP,
  DEFAULT_BUDGET,
  budgetStop,
  budgetLabel,
  estimateSummary,
} from "@/lib/ad-boost/estimate";

/**
 * The campaign-in-motion building blocks + the Phase 2 money views, extracted
 * from app/provider/boost/page.tsx so the admin preview gallery
 * (/admin/ad-boost/preview) renders the EXACT provider-facing components with
 * sample data — what TJ sees there is what providers see, by construction.
 */

/** The campaign the provider committed to — week · channel · plan — as a clean
 *  hairline facts row (Robinhood/Wise feel). Shared by the queued + in-motion
 *  states so the choices they just made are always visible. */
export function CampaignFacts({ request }: { request: BoostRequest }) {
  const channelLabel = boostChannelLabel(request.channel);
  // An active paid plan supersedes the (non-binding) signup intent.
  const hasPaidPlan =
    (request.plan_status === "active" || request.plan_status === "past_due") &&
    request.plan_value != null;
  const configuredBudget =
    request.ad_budget_cents != null
      ? request.ad_budget_type === "daily"
        ? `$${(request.ad_budget_cents / 100).toLocaleString()}/day`
        : `$${(request.ad_budget_cents / 100).toLocaleString()} total`
      : null;
  const budget = hasPaidPlan
    ? (budgetLabel(request.plan_value) ?? `$${request.plan_value}/mo`)
    : configuredBudget ?? budgetLabel(request.intended_monthly_budget);
  const flightStart = request.flight_start_date ?? request.requested_setup_week;
  const facts: { label: string; value: string }[] = [
    {
      label: request.flight_start_date ? "Flight starts" : "Launch",
      value: request.flight_start_date
        ? formatWeek(request.flight_start_date)
        : `Week of ${formatWeek(request.requested_setup_week)}`,
    },
  ];
  if (channelLabel) facts.push({ label: "Advertising on", value: channelLabel });
  if (budget) facts.push({ label: hasPaidPlan ? "Paid plan" : "Campaign budget", value: budget });
  // Flight time context — the "day N of M" that makes a live campaign feel
  // like a running clock instead of a static state. Only when the end date
  // has been entered from the ad platform.
  if (request.flight_end_date) {
    facts.push({
      label: "Flight",
      value: flightProgress(flightStart, request.flight_end_date),
    });
  }

  // Flex + flex-1 (not a fixed grid) so 1, 2, or 3 facts always fill the width
  // evenly — older requests with no channel/budget never leave empty cells.
  return (
    <dl className="mt-7 flex flex-col divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200/80 sm:flex-row sm:divide-x sm:divide-y-0">
      {facts.map((f) => (
        <div key={f.label} className="flex-1 px-4 py-3.5">
          <dt className="text-xs text-gray-400">{f.label}</dt>
          <dd className="mt-0.5 text-sm font-medium text-gray-900">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Live campaign performance — the funnel at equal weight: who visited, who
 *  asked, who reached out (see getCampaignStats/getCampaignQuestions). Leads
 *  are zero for most $50 flights by arithmetic, so questions stand as a
 *  first-class result — each answered one also builds the page's search
 *  visibility — instead of a footnote under a big zero. (Replaced the old
 *  Conversion cell: a percentage over ~20 visitors is noise, and it framed
 *  every flight as lead-or-failure.) */
export function CampaignPerformance({
  stats,
}: {
  stats: {
    visitors: number;
    leads: number;
    questions?: { received: number; unanswered: number };
    since: string;
  };
}) {
  const questions = stats.questions?.received ?? 0;
  const cells: { label: string; value: string }[] = [
    { label: "Visitors", value: stats.visitors.toLocaleString() },
    { label: "Questions", value: questions.toLocaleString() },
    { label: "Leads", value: stats.leads.toLocaleString() },
  ];
  return (
    <div className="mt-8">
      <dl className="flex flex-col divide-y divide-gray-100 overflow-hidden rounded-2xl border border-primary-100/70 bg-primary-50/40 sm:flex-row sm:divide-x sm:divide-y-0 sm:divide-gray-100">
        {cells.map((c) => (
          <div key={c.label} className="flex-1 px-5 py-5">
            <dd className="text-4xl font-display font-bold text-gray-900 tabular-nums leading-none">
              {c.value}
            </dd>
            <dt className="mt-2 text-xs uppercase tracking-wide text-gray-500">
              {c.label}
            </dt>
          </div>
        ))}
      </dl>
      <p className="text-sm text-gray-500 mt-3">
        {stats.leads > 0 ? (
          <>
            Since launch. Find them on your{" "}
            <Link
              href="/provider/connections"
              className="text-primary-600 font-medium hover:underline"
            >
              leads page
            </Link>
            .
          </>
        ) : questions > 0 ? (
          <>
            Since launch. Every question you answer stays on your page, builds
            your visibility in search, and helps families beyond the one who
            asked.{" "}
            <Link
              href="/provider/qna"
              className="text-primary-600 font-medium hover:underline"
            >
              Answer questions
            </Link>
          </>
        ) : (
          <>Since launch. Families will appear here as they arrive.</>
        )}
      </p>
    </div>
  );
}

/**
 * The campaign receipt — an itemized "what your flight bought" list. This is
 * the demand receipt: even a zero-lead window shows real reach (ad views,
 * clicks, visitors, shortlist saves, questions), the dating-app boost move of
 * proving you were seen even when nobody matched. Rows render only when the
 * number exists; Google rows wait for the concierge to enter the dashboard
 * figures. Outcome lines (became a client / still talking) come from the
 * provider's own one-tap reports.
 */
/**
 * One dot per person.
 *
 * The funnel these rows describe is brutally top-heavy -- the best flight this
 * product has run went 391 shown -> 18 clicked -> 7 visited. A proportional bar
 * renders the second stage as a sliver and the third as nothing, and easing the
 * scale would mean smoothing a number we are asking a provider to trust. Dots
 * stay literal: a provider can count the eighteen.
 *
 * Above MAX_DOTS one dot can no longer be one person, so it says so rather than
 * quietly thinning them. Not hypothetical -- Graceful Concord ran 608
 * impressions and LumiWell 435.
 */
const MAX_DOTS = 300;

/**
 * Should the dots animate in on this visit?
 *
 * WHEN THE NUMBERS CHANGE, NOT ON A TIMER AND NOT ONCE PER FLIGHT. Once per
 * flight was too rare: the animation is the best thing on this page and most
 * providers spent their single showing before there was anything to see. Every
 * load is worse -- this is also the screen that asks for money, and making
 * someone sit through an arrival before they can read the evidence is a bad
 * trade on visit three.
 *
 * The rule that falls out of both: replay when the picture actually changed.
 * That is what the animation MEANS -- people arriving -- so firing it on
 * unchanged data is a small lie, and firing it on changed data is the honest
 * reading of the same gesture. It also happens to be what the habituation
 * literature points at: a repeated identical stimulus decays, and it is a
 * CHANGE in the stimulus that restores the response. Here the data is the
 * stimulus, so the two rules are the same rule.
 *
 * Metrics sync hourly, so a live flight earns a replay roughly when something
 * really happened, and an ended flight whose numbers are final animates once
 * and then stays still. Both are correct.
 *
 * Wrapped because Safari private mode throws on localStorage access rather than
 * returning null, and a receipt that crashes is worse than one that re-animates.
 */
function shouldAnimate(key: string | null, signature: string): boolean {
  if (!key || typeof window === "undefined") return false;
  try {
    const k = `olera_boost_receipt_seen:${key}`;
    const seen = window.localStorage.getItem(k);
    if (seen === signature) return false;
    window.localStorage.setItem(k, signature);
    return true;
  } catch {
    return false; // cannot remember -> never animate, rather than animate always
  }
}

/** What the dots currently say. The animation replays when this changes.
 *
 *  Everything the block actually draws goes in, so the signature moves exactly
 *  when the picture does and never when it doesn't. A provider who reloads
 *  four times in an hour sees it once; one who comes back after the hourly
 *  sync added eleven impressions sees it again, because eleven more people
 *  really did see their ad. */
function receiptSignature(receipt: CampaignReceiptData): string {
  const g = receipt.google;
  const o = receipt.outcomes;
  return [
    g.impressions ?? "-",
    g.clicks ?? "-",
    receipt.engagement.visitors,
    receipt.engagement.saves,
    receipt.engagement.questionsReceived,
    o.client,
    o.talking,
  ].join(".");
}

function DotRow({
  n,
  label,
  sub,
  lit,
  animate,
}: {
  n: number;
  label: string;
  sub?: string;
  lit: boolean;
  animate: boolean;
}) {
  const scale = n > MAX_DOTS ? Math.ceil(n / MAX_DOTS) : 1;
  const drawn = Math.ceil(n / scale);
  const maxPerRow = 46;
  const gap = 9.4;
  const width = maxPerRow * gap + 5;

  // BALANCE THE ROWS, DO NOT CENTRE THEM.
  //
  // The problem was never alignment, it was one full row of 46 followed by a
  // stub of 18. Centring that stub only moved the raggedness to the middle and
  // made single-row counts float away from their label, which read worse.
  //
  // So pick the row width from the count instead: 64 dots become two rows of 32
  // rather than 46 + 18, and 268 becomes six rows of ~45. Everything stays left
  // aligned against the label, and the block ends up rectangular on its own
  // terms. Spacing is constant across every row and every stat, because the
  // density IS the quantity -- stretching a short row to fill the width would
  // make twenty people look like two hundred.
  const rows = Math.max(1, Math.ceil(drawn / maxPerRow));
  const perRow = Math.ceil(drawn / rows);

  const dots = Array.from({ length: drawn }, (_, i) => ({
    cx: 4 + (i % perRow) * gap,
    cy: 5 + Math.floor(i / perRow) * gap,
  }));

  return (
    <div className="py-3">
      <div className="flex items-baseline justify-between gap-4">
        <dt className="min-w-0 text-sm text-gray-600">
          {label}
          {sub && <span className="ml-2 text-xs text-gray-400">{sub}</span>}
        </dt>
        <dd className="shrink-0 text-lg font-display font-bold text-gray-900 tabular-nums">
          {n.toLocaleString()}
        </dd>
      </div>
      {/* THE CROWD ARRIVES AS A MASS; THE PEOPLE WHO MOVED ARRIVE ONE BY ONE.
          A faint row is hundreds of strangers -- staggering those is half a
          second of noise that makes the crowd look like the point. A lit row is
          the handful who clicked, and watching them land individually is the
          entire reason they are dots rather than a number. Opacity only: no
          scale, no bounce. This screen sometimes has to tell a provider they
          got zero inquiries, and the register has to hold in that case too. */}
      <svg
        viewBox={`0 0 ${width} ${rows * gap + 4}`}
        className="mt-2 block w-full h-auto"
        style={
          !lit && animate
            ? { animation: "olera-dots-in .24s ease-out both" }
            : undefined
        }
        aria-hidden="true"
      >
        {dots.map((d, i) => (
          <circle
            key={i}
            cx={d.cx}
            cy={d.cy}
            r={lit ? 2.8 : 2.2}
            // The faint dots were light enough to read as a dotted border rather
            // than as people. Still clearly recessive, just present.
            fill={lit ? "#B57F1E" : "#D3CABA"}
            style={
              lit && animate
                ? {
                    opacity: 0,
                    animation: `olera-dots-in .2s ease-out ${Math.min(i * 25, 900)}ms forwards`,
                  }
                : undefined
            }
          />
        ))}
      </svg>
      {scale > 1 && (
        <p className="mt-1 text-[10px] text-gray-400">each dot is {scale} people</p>
      )}
    </div>
  );
}

export function CampaignReceiptBlock({
  receipt,
  flightKey = null,
}: {
  receipt: CampaignReceiptData;
  /** Campaign tag. Gates the one-time arrival animation; omit to never animate. */
  flightKey?: string | null;
}) {
  const { google, engagement, outcomes } = receipt;
  const rows: { label: string; value: string; sub?: string }[] = [];

  // Decided after mount, never during render: localStorage does not exist on the
  // server, and reading it in render would hand the client a different first
  // paint than the HTML it hydrates. Starting false also means the no-JS and
  // reduced-motion paths get the finished state, which is the correct default.
  const [animate, setAnimate] = useState(false);
  const blockRef = useRef<HTMLDivElement>(null);
  const signature = receiptSignature(receipt);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const el = blockRef.current;
    if (!el) return;

    // WAIT UNTIL IT IS ACTUALLY ON SCREEN. Firing on mount both plays the
    // arrival and spends the allowance -- so a provider whose receipt sits
    // below the fold (the live view puts a facts row, a 3-up stat row and a
    // momentum line above it) would scroll down to a finished list and never
    // see it. The feature would have been silently dead for exactly the people
    // it was built for.
    const start = () => {
      if (shouldAnimate(flightKey, signature)) setAnimate(true);
    };
    if (typeof IntersectionObserver === "undefined") {
      start();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        start();
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [flightKey, signature]);

  // The first three stages are drawn as dots instead of list rows -- same
  // numbers, same order, but the shape of the drop-off is the finding and a
  // right-aligned figure cannot carry it.
  const dotRows: { n: number; label: string; sub?: string; lit: boolean }[] = [];
  if (google.impressions != null && google.impressions > 0) {
    dotRows.push({
      n: google.impressions,
      label: "Times your ad was shown",
      sub: "local families searching for care",
      lit: false,
    });
  }
  if (google.clicks != null && google.clicks > 0) {
    dotRows.push({
      n: google.clicks,
      label: "Clicked through to your page",
      sub: google.ctr != null ? `${google.ctr}% click rate` : undefined,
      lit: true,
    });
  }
  // "Visited your page" is deliberately absent. It said the same thing as the
  // row above it -- a person arriving from the ad -- but counted it from our own
  // tracking rather than Google's, so the two disagreed: 16 clicked, 19 visited.
  // A funnel that grows at the second step reads as broken, and a provider
  // cannot be expected to hold "different measurement windows" in their head.
  // Google's click count wins because it is what they paid for and it carries
  // the click rate. The visitor figure still has a home: the VISITORS tile in
  // CampaignPerformance directly above this block, where it is not pretending
  // to be a separate funnel stage.

  if (engagement.saves > 0) {
    rows.push({
      label: "Saved you to their shortlist",
      value: engagement.saves.toLocaleString(),
    });
  }
  if (engagement.questionsReceived > 0) {
    rows.push({
      label: "Question taps",
      value: engagement.questionsReceived.toLocaleString(),
      sub:
        engagement.questionTopics < engagement.questionsReceived
          ? `${engagement.questionTopics.toLocaleString()} unique ${engagement.questionTopics === 1 ? "topic" : "topics"}`
          : undefined,
    });
  }
  if (
    dotRows.length === 0 &&
    rows.length === 0 &&
    outcomes.client === 0 &&
    outcomes.talking === 0
  ) {
    return null;
  }

  return (
    <div className="mt-8" ref={blockRef}>
      <style>{"@keyframes olera-dots-in{from{opacity:0}to{opacity:1}}"}</style>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
        What your campaign bought
      </p>
      <dl className="mt-3 divide-y divide-gray-100 border-y border-gray-100">
        {dotRows.map((d) => (
          <DotRow key={d.label} n={d.n} label={d.label} sub={d.sub} lit={d.lit} animate={animate} />
        ))}
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-4 py-3">
            <dt className="min-w-0 text-sm text-gray-600">
              {r.label}
              {r.sub && <span className="ml-2 text-xs text-gray-400">{r.sub}</span>}
            </dt>
            <dd className="shrink-0 text-lg font-display font-bold text-gray-900 tabular-nums">
              {r.value}
            </dd>
          </div>
        ))}
        {/* ONE OUTCOME ROW, NEVER TWO.
            "Became a paying client 1" stacked on "Still in conversation 1" made
            a provider read two separate results and work out how they relate.
            They are stages of one thing, so the strongest one leads and the
            other rides along as a sub -- the same pattern the click-rate sub
            already uses. Nothing is lost: with no clients, the conversation row
            leads on its own. */}
        {outcomes.client > 0 ? (
          <div className="flex items-baseline justify-between gap-4 py-3">
            <dt className="min-w-0 text-sm font-medium text-primary-700">
              Became {outcomes.client === 1 ? "a paying client" : "paying clients"}
              {outcomes.talking > 0 && (
                <span className="ml-2 text-xs font-normal text-gray-400">
                  {outcomes.talking.toLocaleString()} still in conversation
                </span>
              )}
            </dt>
            <dd className="shrink-0 text-lg font-display font-bold text-primary-700 tabular-nums">
              {outcomes.client.toLocaleString()}
            </dd>
          </div>
        ) : (
          outcomes.talking > 0 && (
            <div className="flex items-baseline justify-between gap-4 py-3">
              <dt className="min-w-0 text-sm text-gray-600">Still in conversation</dt>
              <dd className="shrink-0 text-lg font-display font-bold text-gray-900 tabular-nums">
                {outcomes.talking.toLocaleString()}
              </dd>
            </div>
          )
        )}
      </dl>
    </div>
  );
}

/** The honest volume math for a zero-lead flight, phrased as arithmetic, not
 *  excuse: leads arrive about 1 per 30 clicks, so N clicks predicts X. Only
 *  renders when clicks were entered, so it can never speculate. */
export function ReceiptMathLine({ receipt }: { receipt: CampaignReceiptData }) {
  const clicks = receipt.google.clicks;
  if (clicks == null || clicks <= 0) return null;
  return (
    <p className="mt-4 text-sm text-gray-500 leading-relaxed max-w-lg">
      For context: in senior care, about 1 in every 30 ad clicks becomes an
      inquiry, and families often compare for weeks before reaching out. Your
      flight bought {clicks.toLocaleString()} {clicks === 1 ? "click" : "clicks"},
      so this window came down to volume, not interest. The families above have
      seen you, and you are now in their consideration set.
    </p>
  );
}

/**
 * Plan active — the celebration + steady state after checkout. `celebrate` is
 * the just-returned-from-Stripe moment (may render before the webhook lands,
 * so plan_value can still be null; copy degrades gracefully).
 */
export function PlanActive({
  request,
  campaignStats,
  celebrate,
}: {
  request: BoostRequest;
  campaignStats: {
    visitors: number;
    leads: number;
    questions?: { received: number; unanswered: number };
    since: string;
  } | null;
  celebrate: boolean;
}) {
  const tier = budgetStop(request.plan_value);
  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="w-2 h-2 rounded-full bg-primary-500 animate-pulse" />
        <span className="text-sm font-semibold text-primary-700">Plan active</span>
      </div>
      <h2 className="text-2xl font-display font-semibold text-gray-900">
        {celebrate ? "You're all set." : "Your plan is running."}
      </h2>
      <p className="text-gray-500 mt-3 leading-relaxed">
        {tier
          ? `Your ${tier.name} plan (${tier.amount}/mo, all-in) is active. `
          : "Your monthly plan is active. "}
        We keep the ads running and manage everything; families arrive on your
        dashboard as they come in. A month with zero family inquiries is free.
      </p>

      <CampaignFacts request={request} />
      {campaignStats && <CampaignPerformance stats={campaignStats} />}

      <p className="mt-6 text-sm text-gray-500">
        Change or cancel anytime by replying to any campaign email, or{" "}
        <Link href="/managed-ads-terms" target="_blank" className="text-primary-600 font-medium hover:underline">
          read how the plan works
        </Link>
        .
      </p>

      <Link
        href="/provider"
        className="inline-flex items-center gap-2 mt-8 text-primary-600 font-medium hover:gap-3 transition-all"
      >
        Back to dashboard
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
        </svg>
      </Link>
    </div>
  );
}

/**
 * Terminal intro state before the featured results/payment moment is armed.
 * Auto-end and the buffered wrap-up email are deliberately separate; this
 * view closes that interval without falling back to the free application.
 */
export function CampaignWrapUpPending({ request }: { request: BoostRequest }) {
  const cancelled = request.status === "cancelled";
  return (
    <div className="max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-600 mb-2">
        {cancelled ? "Campaign closed" : "Campaign complete"}
      </p>
      <h2 className="text-[clamp(1.5rem,4vw,2rem)] font-display font-bold text-gray-900 leading-tight">
        {cancelled ? "Your campaign is no longer running." : "Your results are being finalized."}
      </h2>
      <p className="mt-3 max-w-lg text-gray-500 leading-relaxed">
        {cancelled
          ? "Your introductory campaign remains on your account. Reply to any campaign email if you want help choosing a paid plan to restart it."
          : "We’re checking the final campaign numbers now. We’ll email you as soon as your results and next-step options are ready here."}
      </p>
      <Link
        href="/provider"
        className="inline-flex items-center gap-2 mt-8 text-primary-600 font-medium hover:gap-3 transition-all"
      >
        Back to dashboard
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
        </svg>
      </Link>
    </div>
  );
}

/**
 * The plan cards + de-risk promises + checkout CTA, extracted so the wrap-up
 * moment and the live view's early-upgrade path stay one implementation.
 * Owns its own selection state and always defaults to the current Starter.
 * `intended_monthly_budget` is historical signup data: older campaign rows can
 * carry the former $150 Starter choice, while new requests carry the free intro
 * amount. Neither should silently override today's $75 entry offer.
 */
export function PlanChooser({
  request,
  onCheckout,
  onPlanSelected,
  submitting,
  error,
}: {
  request: BoostRequest;
  onCheckout: (planValue: number) => void;
  onPlanSelected?: (planValue: number) => void;
  submitting: boolean;
  error: string | null;
}) {
  const paidStops = BUDGET_STOPS.filter((b) => b.sublabel !== "on us");
  const [plan, setPlan] = useState<number>(DEFAULT_BUDGET);
  const selected = budgetStop(plan);
  const scaleContactHref = `mailto:support@olera.care?subject=${encodeURIComponent("Olera Ad Boost Scale")}&body=${encodeURIComponent(`Campaign request: ${request.id}`)}`;

  return (
    <>
      {/* Single-row plan cards: name · price · estimate. No blurbs here — the
          results above are the pitch (the apply flow keeps its blurbs). */}
      <fieldset className="mt-4">
        <legend className="sr-only">Plan</legend>
        <div className="flex flex-col gap-3">
          {paidStops.map((b) => {
            const active = plan === b.value;
            return (
              <button
                key={b.value}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setPlan(b.value);
                  onPlanSelected?.(b.value);
                }}
                className={`w-full rounded-2xl border px-5 py-4 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
                  active
                    ? "border-primary-500 bg-primary-50/70"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50/70"
                }`}
              >
                <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className={`min-w-0 text-base font-semibold ${active ? "text-primary-700" : "text-gray-900"}`}>
                    {b.name}
                    <span className="font-normal text-gray-300"> · </span>
                    <span className="tabular-nums">{b.amount}/mo</span>
                    {b.chip && (
                      <span
                        className={`ml-2 inline-flex translate-y-[-1px] rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          active ? "border-primary-400 text-primary-700" : "border-gray-300 text-gray-500"
                        }`}
                      >
                        {b.chip}
                      </span>
                    )}
                  </span>
                  <span className={`shrink-0 text-sm tabular-nums ${active ? "text-primary-600/80" : "text-gray-400"}`}>
                    {estimateSummary(b)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <a
        href={scaleContactHref}
        onClick={() => onPlanSelected?.(CUSTOM_SCALE_STOP.value)}
        className="mt-4 flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl border border-dashed border-gray-200 px-5 py-4 text-left transition-colors hover:border-primary-300 hover:bg-primary-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
      >
        <span>
          <span className="text-base font-semibold text-gray-900">
            {CUSTOM_SCALE_STOP.name}
            <span className="font-normal text-gray-300"> · </span>
            <span className="tabular-nums">{CUSTOM_SCALE_STOP.amount}/mo</span>
          </span>
          <span className="mt-1 block text-xs text-gray-400">
            {estimateSummary(CUSTOM_SCALE_STOP)} · shaped around your market
          </span>
        </span>
        <span className="shrink-0 text-sm font-medium text-primary-600">
          Talk with us →
        </span>
      </a>

      {/* The de-risking, promoted from fine print to first-class promises —
          this is the page where money is asked, so this is where the safety
          net must be loudest (Duolingo lists anti-trap terms as benefits). */}
      {/* De-risk promises at label scale — scannable, not sentences. */}
      <ul className="mt-6 space-y-2.5">
        <PromiseRow>
          Zero-inquiry months are free.{" "}
          <Link href="/managed-ads-terms" target="_blank" className="text-primary-600 font-medium hover:underline">
            The guarantee
          </Link>
        </PromiseRow>
        <PromiseRow>Cancel or pause anytime.</PromiseRow>
        <PromiseRow>No per-lead fees, ever.</PromiseRow>
      </ul>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <button
        type="button"
        disabled={submitting}
        onClick={() => onCheckout(plan)}
        className="inline-flex items-center gap-2.5 mt-6 px-8 py-3.5 bg-gray-900 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[16px] font-semibold rounded-full active:scale-[0.98] transition-all duration-200"
      >
        {submitting ? "One moment…" : `Continue with ${selected?.name ?? "your plan"}`}
        {!submitting && (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
        )}
      </button>
      <p className="mt-3 text-sm text-gray-500">
        Nothing is charged until you confirm on the next screen.
      </p>
    </>
  );
}

/**
 * The wrap-up moment — the FEATURED payment ask. Arms on a value event (3rd
 * lead, or concierge marked the promo complete). Leads with the provider's
 * own numbers, then one calm plan choice -> Stripe Checkout. The live view
 * carries the same always-visible PlanChooser once the campaign is running.
 */
export function WrapUpMoment({
  request,
  campaignStats,
  receipt,
  onCheckout,
  onPlanSelected,
  onNotNow,
  submitting,
  error,
}: {
  request: BoostRequest;
  campaignStats: {
    visitors: number;
    leads: number;
    questions?: { received: number; unanswered: number };
    since: string;
  } | null;
  receipt?: CampaignReceiptData | null;
  onCheckout: (planValue: number) => void;
  onPlanSelected?: (planValue: number) => void;
  onNotNow?: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const leads = campaignStats?.leads ?? 0;
  const planSection = (
    <>
      <PlanChooser
        request={request}
        onCheckout={onCheckout}
        onPlanSelected={onPlanSelected}
        submitting={submitting}
        error={error}
      />
      <div className="mt-10">
        <Link
          href="/provider"
          onClick={onNotNow}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          Not now, back to dashboard
        </Link>
      </div>
    </>
  );

  // Zero leads = the demand-receipt path. No fake celebration; instead the
  // itemized proof the ad worked (reach, clicks, saves) + the volume math and
  // the plans as a volume choice, not a victory lap or a false celebration.
  if (leads === 0) {
    const impressions = receipt?.google.impressions;
    const showedInterest =
      (impressions ?? 0) > 0 ||
      (receipt?.google.clicks ?? 0) > 0 ||
      (receipt?.engagement.visitors ?? 0) > 0 ||
      (receipt?.engagement.saves ?? 0) > 0 ||
      (receipt?.engagement.questionsReceived ?? 0) > 0;
    return (
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-600 mb-2">
          Your first campaign, wrapped
        </p>
        <h2 className="text-[clamp(1.5rem,4vw,2rem)] font-display font-bold text-gray-900 leading-tight">
          {impressions != null && impressions > 0
            ? `Your ad reached ${impressions.toLocaleString()} local families.`
            : "Your market saw you this window."}
        </h2>
        <p className="text-gray-500 mt-3 leading-relaxed max-w-lg">
          No inquiries landed this window. Here is exactly what the flight
          bought, so you can judge it on the numbers.
        </p>

        {receipt && <CampaignReceiptBlock receipt={receipt} flightKey={request.campaign_tag || request.id} />}
        {receipt && <ReceiptMathLine receipt={receipt} />}

        <p className="text-gray-500 mt-6 leading-relaxed max-w-lg">
          {showedInterest
            ? "This intro showed interest, but it did not run at enough volume to produce an Olera inquiry. "
            : "This intro did not produce enough measurable activity to generate an Olera inquiry. "}
          A monthly plan gives the campaign more room to work—and if a full paid
          month produces zero inquiries, that month is credited or refunded.
        </p>

        <p className="mt-10 text-xs font-semibold uppercase tracking-[0.12em] text-primary-600">
          Run it at real volume
        </p>
        {planSection}
      </div>
    );
  }

  const clientCount = receipt?.outcomes.client ?? 0;
  return (
    <div className="max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-600 mb-2">
        Your first campaign, wrapped
      </p>
      <h2 className="text-[clamp(1.5rem,4vw,2rem)] font-display font-bold text-gray-900 leading-tight">
        {clientCount > 0
          ? clientCount === 1
            ? "A family became your client."
            : `${clientCount} families became your clients.`
          : leads === 1
            ? "A family reached out."
            : `${leads} families reached out.`}
      </h2>
      {/* One line of value math — the stat row below does the arguing. */}
      <p className="text-gray-500 mt-3 leading-relaxed max-w-lg">
        Referral sites charge $50 to $150 for one shared lead. Yours were
        free, and only yours.
      </p>

      {campaignStats && <CampaignPerformance stats={campaignStats} />}
      {receipt && <CampaignReceiptBlock receipt={receipt} flightKey={request.campaign_tag || request.id} />}

      {/* The decision — eyebrow only; the cards say what plans are. */}
      <p className="mt-12 text-xs font-semibold uppercase tracking-[0.12em] text-primary-600">
        Keep it going
      </p>
      {planSection}
    </div>
  );
}

/** "Day 12 of 28 · ends Aug 3" from the actual/expected start + platform end
 *  date. Parses date parts locally (no TZ drift, same rule as formatWeek). */
function flightProgress(startIso: string, endIso: string): string {
  const parse = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    return y && m && day ? new Date(y, m - 1, day) : null;
  };
  const start = parse(startIso);
  const end = parse(endIso);
  if (!start || !end) return formatWeek(endIso);
  const DAY = 24 * 60 * 60 * 1000;
  const total = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY) + 1);
  const today = new Date();
  const day = Math.floor((today.getTime() - start.getTime()) / DAY) + 1;
  // Facts row also renders for scheduled campaigns whose end date was entered
  // at setup — a pre-start flight must not read "Day 1" as if it were running.
  if (day < 1) return `${total} days · ends ${formatWeek(endIso)}`;
  if (day > total) return `Ended ${formatWeek(endIso)}`;
  return `Day ${day} of ${total} · ends ${formatWeek(endIso)}`;
}

/** The "numbers going up" line — rolling last-7-days momentum under the stat
 *  row. Renders nothing when the week was quiet (no fake motion). */
function MomentumLine({ week }: { week: CampaignReceiptData["week"] }) {
  if (!week) return null;
  const parts: string[] = [];
  if (week.leads > 0) parts.push(`${week.leads} new ${week.leads === 1 ? "lead" : "leads"}`);
  if (week.questions > 0)
    parts.push(`${week.questions} ${week.questions === 1 ? "question" : "questions"}`);
  if (week.visitors > 0)
    parts.push(`${week.visitors} ${week.visitors === 1 ? "visitor" : "visitors"}`);
  if (parts.length === 0) return null;
  return (
    <p className="mt-3 text-sm font-medium text-primary-700">
      ↑ This week: {parts.join(" · ")}
    </p>
  );
}

/**
 * The live / in-motion campaign view — where conviction builds. The wrap-up
 * converts providers who already decided; this view is where they watch the
 * numbers move (momentum line, accruing receipt, flight clock) and can start
 * a plan early without hunting for a low-contrast disclosure.
 * Shared with the admin preview gallery so TJ sees exactly what providers see.
 */
export function CampaignInMotion({
  request,
  campaignStats,
  receipt,
  onCheckout,
  submitting,
  error,
  onEditPhotos,
  onPlanSelected,
}: {
  request: BoostRequest;
  campaignStats: {
    visitors: number;
    leads: number;
    questions?: { received: number; unanswered: number };
    since: string;
  } | null;
  receipt?: CampaignReceiptData | null;
  onCheckout: (planValue: number) => void;
  submitting: boolean;
  error: string | null;
  onEditPhotos?: () => void;
  onPlanSelected?: (planValue: number) => void;
}) {
  const label: Record<string, string> = {
    requested: "Launch plan received",
    scheduled: "Setup scheduled",
    live: "Your campaign is live",
  };
  const isLive = request.status === "live";
  const canChoosePlan = request.plan_status == null || request.plan_status === "canceled";
  const photoUpdateRequested =
    !isLive && request.photo_readiness_status === "update_requested";
  const photoReviewRequested =
    !isLive && request.photo_readiness_status === "review_requested";
  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2.5 mb-3">
        <span className={`w-2 h-2 rounded-full animate-pulse ${photoUpdateRequested ? "bg-amber-500" : "bg-primary-500"}`} />
        <span className={`text-sm font-semibold ${photoUpdateRequested ? "text-amber-700" : "text-primary-700"}`}>
          {photoUpdateRequested
            ? "Photo update needed"
            : photoReviewRequested
              ? "Updated photos received"
              : label[request.status] ?? "In progress"}
        </span>
      </div>
      <h2 className="text-2xl font-display font-semibold text-gray-900">
        {isLive
          ? "Your campaign is live."
          : photoUpdateRequested
            ? "One photo update before we launch."
            : photoReviewRequested
              ? "We\u2019re reviewing your new photos."
              : "We\u2019re on it."}
      </h2>
      <p className="text-gray-500 mt-3 leading-relaxed">
        {isLive
          ? "Here\u2019s how your campaign is performing. Families arrive on your dashboard as they come in."
          : photoUpdateRequested
            ? "Your request, timing, and campaign preferences are still saved. A few clearer, real-world photos will give the promotional budget a better chance of turning clicks into family inquiries."
            : photoReviewRequested
              ? "Thanks for updating your gallery. Our team will review it and continue campaign setup once the photos are ready; there is nothing else to resubmit."
          : "We\u2019ll send over the launch plan before anything goes live, confirm the details, then families arrive on your dashboard as they come in."}
      </p>

      {photoUpdateRequested && (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
          <p className="text-sm font-semibold text-gray-900">Photos that help families choose</p>
          <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-gray-600">
            <li>• A welcoming photo of your team</li>
            <li>• A clear photo of your location or care setting</li>
            <li>• A natural care or service photo, with permission</li>
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-gray-500">
            Phone photos are completely fine—bright, sharp, and without text overlays works best.
          </p>
          {onEditPhotos && (
            <button
              type="button"
              onClick={onEditPhotos}
              className="mt-4 inline-flex items-center rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
            >
              Add better photos
            </button>
          )}
        </div>
      )}

      {photoReviewRequested && (
        <div className="mt-6 rounded-2xl border border-primary-100 bg-primary-50/50 p-5">
          <p className="text-sm font-semibold text-primary-800">Your update is back with our team</p>
          <p className="mt-1.5 text-sm leading-relaxed text-gray-600">
            We’ll check the new gallery and email you as soon as campaign setup continues.
          </p>
        </div>
      )}

      {/* The campaign they committed to — week, channel, budget, flight clock. */}
      <CampaignFacts request={request} />

      {/* When live, real performance — the funnel at equal weight — is THE
          focal point, with the week's momentum right under it. */}
      {isLive && campaignStats && <CampaignPerformance stats={campaignStats} />}
      {isLive && receipt && <MomentumLine week={receipt.week} />}

      {/* The accruing receipt: ad reach, saves, questions, reported outcomes. */}
      {isLive && receipt && <CampaignReceiptBlock receipt={receipt} flightKey={request.campaign_tag || request.id} />}

      {/* The early plan choice uses the same visible cards as the wrap-up.
          Providers should not have to discover that a section-heading-looking
          line is clickable, especially after they have already seen value. */}
      {isLive && canChoosePlan && (
        <div className="mt-10 border-t border-gray-100 pt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-600">
            Keep it going
          </p>
          <h3 className="mt-2 text-xl font-display font-semibold text-gray-900">
            {request.flight_end_date
              ? `Keep your campaign running past ${formatWeek(request.flight_end_date)}.`
              : "Keep your campaign running without a gap."}
          </h3>
          <p className="mt-2 text-sm text-gray-500 leading-relaxed max-w-lg">
            Choose a monthly plan now and it takes over when your free intro
            ends. Your intro continues either way, and nothing becomes paid
            until you confirm in Stripe.
          </p>
          <PlanChooser
            request={request}
            onCheckout={onCheckout}
            onPlanSelected={onPlanSelected}
            submitting={submitting}
            error={error}
          />
        </div>
      )}

      <Link
        href="/provider"
        className="inline-flex items-center gap-2 mt-8 text-primary-600 font-medium hover:gap-3 transition-all"
      >
        Back to dashboard
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
        </svg>
      </Link>
    </div>
  );
}

/** One first-class promise with a quiet teal check — the de-risk facts
 *  rendered as benefits, not fine print. */
function PromiseRow({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-gray-600 leading-relaxed">
      <svg
        className="mt-0.5 w-4 h-4 shrink-0 text-primary-600"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
      </svg>
      <span>{children}</span>
    </li>
  );
}

/** Render a stored YYYY-MM-DD week back to "Mon D" without TZ drift. */
function formatWeek(isoDateStr: string): string {
  const [y, m, d] = isoDateStr.split("-").map(Number);
  if (!y || !m || !d) return isoDateStr;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

"use client";

import type { NodeTrend } from "./OperatingMap";
import styles from "./OperatingMap.module.css";

/**
 * The panel behind every number on the map: what it counts, how it has
 * moved, what that means, and where to go to change it.
 *
 * It exists because a number on its own does not tell you what to do with
 * it. Somebody reading this map wants three things in order — is this good,
 * is it getting better, and what is the next move — and having to leave the
 * page to answer any of them is the reason dashboards go unread.
 *
 * Everything here is derived, never written by hand per node. The diagnosis
 * reads the eight-week series; the only per-node content is the playbook
 * below, which is a judgement about what to do and cannot be computed.
 */

/**
 * Where to go and what to do about each number.
 *
 * One action each, and the action has to be the one that actually moves the
 * number — not a page where the number is also displayed. A link that only
 * shows you the same figure somewhere else is worse than no link, because it
 * looks like a next step and is not one.
 */
const PLAYBOOK: Record<string, { href: string; label: string; advice: string }> = {
  cities: {
    href: "/admin/directory",
    label: "Directory",
    advice:
      "Coverage grows by adding providers, not cities. Run the city pipeline for a market before counting it as launched.",
  },
  cr2: {
    href: "/admin/organic-growth",
    label: "Organic growth",
    advice:
      "Search traffic moves on published pages and indexing, both of which lag by weeks. Check which pages gained impressions before changing anything.",
  },
  cr4: {
    href: "/admin/organic-growth",
    label: "Growth drivers",
    advice:
      "Look at which of the three surfaces moved. Provider pages rise with directory coverage; benefits and editorial rise with publishing.",
  },
  cr6: {
    href: "/admin/analytics",
    label: "Analytics",
    advice:
      "Read this against page visits above it. If visits rose and this did not, the call to action is the problem, not the traffic.",
  },
  cr6a: {
    href: "/admin/questions",
    label: "Questions queue",
    advice:
      "Answer the oldest unanswered questions first. A published answer is what makes the page worth asking on again.",
  },
  cr6b: {
    href: "/admin/connections",
    label: "Connections",
    advice:
      "Watch the gap between asks and what reached a provider. A request nobody received is a lost lead that still counts here.",
  },
  cr6c: {
    href: "/admin/benefits",
    label: "Benefits",
    advice:
      "Completions fall when the screener gets longer or a step breaks. Check the drop-off before assuming demand changed.",
  },
  flow_questions: {
    href: "/admin/deliverability",
    label: "Deliverability",
    advice:
      "Watch failed sends, not the gap to the chip. A provider with no email on file is the usual reason a question never lands.",
  },
  flow_connections: {
    href: "/admin/deliverability",
    label: "Deliverability",
    advice:
      "Watch failed sends, not the gap to the chip. A lead nobody received still counts as an ask, and is the cheapest one to recover.",
  },
  cp1: {
    href: "/admin/directory",
    label: "Directory",
    advice:
      "The split is what matters. A large unclaimed half is the supply of providers outreach has to work through.",
  },
  cp2: {
    href: "/admin/provider-outreach",
    label: "Provider outreach",
    advice:
      "This is our tempo, not the market's. It only rises when someone sends — a flat week usually means nobody ran a batch.",
  },
  m1: {
    href: "/admin/care-seekers",
    label: "Care seekers",
    advice:
      "Completed profiles that never publish are the leak. Work the unpublished list before chasing new signups.",
  },
  m2: {
    href: "/admin/directory",
    label: "Unclaimed providers",
    advice:
      "Claims follow contact. If this is flat while outreach is not, the claim flow is where to look.",
  },
  m3: {
    href: "/admin/ad-boost",
    label: "Ad Boost",
    advice:
      "Requests come from providers who already see traffic. Providers with rising page views are the ones worth asking.",
  },
  m4: {
    href: "/admin/staffing-outreach",
    label: "Staffing outreach",
    advice:
      "Activation follows a conversation, not an email. Check which outreach reached a call this week.",
  },
  m5: {
    href: "/admin/medjobs",
    label: "MedJobs",
    advice:
      "The gap between started and complete is your fastest supply. Applicants stall at the intro video — chase those before sourcing new ones.",
  },
  cw1: {
    href: "/admin/student-outreach",
    label: "Student outreach",
    advice:
      "A listed university is worth nothing without a named advisor. Add contacts before adding campuses.",
  },
  cw2: {
    href: "/admin/student-outreach",
    label: "Advisors",
    advice:
      "Advisors go stale. Re-verify contacts that have not replied before adding more.",
  },
  tb1: {
    href: "/admin/connections",
    label: "Connections",
    advice:
      "Providers who never answer are the constraint. Work the silent list — one response is worth more than one more inquiry.",
  },
  tc1: {
    href: "/admin/medjobs",
    label: "MedJobs interviews",
    advice:
      "Proposed interviews that never confirm mean scheduling friction. Chase the unconfirmed before sourcing more candidates.",
  },
  tc2: {
    href: "/admin/medjobs",
    label: "MedJobs placements",
    advice:
      "Hires follow confirmed interviews with a lag. If interviews rose and this did not, the offer stage is where it is stalling.",
  },
};

/** Volume below which a percentage is more noise than news. */
const SMALL = 10;

/**
 * What the series actually says, in one or two sentences.
 *
 * Written to be falsifiable rather than encouraging: where the data cannot
 * support a claim, it says so instead of picking the flattering reading.
 */
function diagnose(t: NodeTrend): string {
  const total = t.series.reduce((a, b) => a + b, 0);
  const weeksLive = t.series.filter((v) => v > 0).length;
  const pct = Math.round(Math.abs(t.weekChange ?? 0) * 100);

  if (total === 0) {
    return "Nothing has reached this step in eight weeks. Either the path into it is broken or nobody has taken it.";
  }
  if (t.week.now === 0) {
    return `Nothing this week, after ${total} over the previous seven. A full stop is worth checking before it is worth explaining.`;
  }
  if (weeksLive <= 2) {
    return "Only a week or two of activity so far. There is not enough history here to call a direction yet.";
  }
  if (t.month.now < SMALL) {
    return `Small numbers — ${t.month.now} in four weeks. Week-to-week swings at this volume are noise; read the eight-week shape instead.`;
  }
  if (t.score === 0) {
    return t.monthDirection === 0
      ? "Holding steady week to week and month to month. Nothing here needs attention unless steady is not the goal."
      : `Flat this week but ${t.monthDirection > 0 ? "up" : "down"} over the month. The month is the more reliable read.`;
  }
  const dir = t.score > 0 ? "Up" : "Down";
  const agrees = Math.sign(t.score) === t.monthDirection;

  if (Math.abs(t.score) >= 2 && t.monthDirection === 0) {
    return `${dir} ${pct}% on last week, but flat across the month. One strong week is not yet a trend.`;
  }
  if (Math.abs(t.score) >= 2 && agrees) {
    return `${dir} ${pct}% on last week and ${t.monthDirection > 0 ? "rising" : "falling"} over the month. The week and the month agree, which is what makes it a trend.`;
  }
  if (Math.abs(t.score) >= 2) {
    // The two readings point opposite ways. Saying so is the finding — the
    // month is the steadier one, and one week against it is not yet news.
    return `${dir} ${pct}% on last week, against a month that is ${t.monthDirection > 0 ? "rising" : "falling"}. One week does not overturn four; watch whether it holds.`;
  }
  if (!agrees && t.monthDirection !== 0) {
    return `${dir} ${pct}% on last week, against a month that is ${t.monthDirection > 0 ? "rising" : "falling"}. A small move in the other direction — noise until it repeats.`;
  }
  return `${dir} ${pct}% on last week — a real move, but a small one. Worth watching another week before acting on it.`;
}

/** Eight weeks as one small shape. Bars, because these are counts per week. */
function Sparkline({ series, tone }: { series: number[]; tone: string | null }) {
  const peak = Math.max(...series, 1);
  const W = 96;
  const H = 26;
  const gap = 2;
  const barW = (W - gap * (series.length - 1)) / series.length;

  return (
    <svg
      className={styles.spark}
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Weekly counts: ${series.join(", ")}`}
    >
      {series.map((v, i) => {
        // A zero week still gets a hairline. An empty gap reads as missing
        // data; a flat mark reads as nothing happened, which is the truth.
        const h = v === 0 ? 1 : Math.max(1.5, (v / peak) * H);
        const last = i === series.length - 1;
        return (
          <rect
            key={i}
            x={i * (barW + gap)}
            y={H - h}
            width={barW}
            height={h}
            rx={1}
            // The colour comes from CSS rather than a fill attribute: a
            // presentation attribute loses to any rule, and .spark rect
            // already sets one.
            className={last ? `${styles.sparkLast}${tone ? ` ${tone}` : ""}` : undefined}
          />
        );
      })}
    </svg>
  );
}

export default function NodeTip({
  text,
  nodeKey,
  caveat,
  trend,
  tone,
  x,
  y,
  inspectable,
  onEnter,
  onLeave,
}: {
  /** What the number counts. */
  text: string;
  nodeKey: string;
  caveat?: string | null;
  trend?: NodeTrend | null;
  /** The trend colour class, so the panel matches the number it opened from. */
  tone?: string | null;
  x: number;
  y: number;
  /** Whether clicking the number opens the rows behind it. */
  inspectable?: boolean;
  /** Keeps the panel open while the pointer is inside it, so links work. */
  onEnter: () => void;
  onLeave: () => void;
}) {
  const pct =
    trend?.weekChange === null || trend?.weekChange === undefined
      ? null
      : `${trend.weekChange > 0 ? "+" : "−"}${Math.round(Math.abs(trend.weekChange) * 100)}%`;
  const play = PLAYBOOK[nodeKey];

  return (
    <div
      className={styles.tip}
      style={{ left: x, top: y }}
      role="tooltip"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {text}
      {caveat && <span className={styles.tipCaveat}>{caveat}</span>}

      {trend && (
        <div className={styles.tipTrend}>
          <Sparkline series={trend.series} tone={tone ?? null} />
          <div className={styles.tipTrendRead}>
            <span className={tone ?? undefined}>
              {pct ? `${pct} this week` : `${trend.week.now} this week`}
            </span>
            <span className={styles.tipTrendSub}>
              {trend.month.now} in four weeks · {trend.month.prior} the four before
            </span>
          </div>
        </div>
      )}

      {trend && <span className={styles.tipSection}>{diagnose(trend)}</span>}

      {play && (
        <span className={styles.tipSection}>
          {play.advice}
          <a className={styles.tipLink} href={play.href}>
            {play.label} →
          </a>
        </span>
      )}

      {inspectable && (
        <span className={styles.tipFoot}>Click the number for the rows behind it.</span>
      )}
    </div>
  );
}

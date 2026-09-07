"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ManagedAdsStats } from "@/lib/managed-ads/stats.server";

/**
 * The live results strip on /managed-ads.
 *
 * Numbers arrive as props from the server component — this file never touches
 * Supabase and never receives a lead row, only integers.
 *
 * Two honesty rules are built into the markup rather than left to the writer:
 *   1. Spend and clicks are reconciled by hand from each ad platform, so the
 *      footnote says so and dates them. They are a floor, not a live feed.
 *   2. A tile whose value is unavailable renders an em dash, never a zero.
 *      A confident "0" and "we could not read it" are different claims.
 *
 * The count-up is decoration. It runs once when the strip scrolls into view and
 * is skipped entirely under prefers-reduced-motion, which also means the real
 * value is what server-renders — the animation never gates the number.
 */

const DURATION_MS = 900;

/** useLayoutEffect warns when it runs during SSR; this is the usual shim. */
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * `primed` — we intend to animate this value at all (mounted, motion allowed).
 * `run`    — the strip has scrolled into view, so go.
 *
 * The server renders the true value, which is what a reader with no JavaScript
 * keeps. Zeroing therefore has to happen in a layout effect, before the browser
 * paints: doing it in a normal effect shows the final number and then snatches
 * it back to zero, which reads as a glitch rather than as a count-up.
 */
function useCountUp(target: number, primed: boolean, run: boolean): number {
  const [value, setValue] = useState(target);
  const raf = useRef<number | null>(null);

  useIsomorphicLayoutEffect(() => {
    if (primed) setValue(0);
  }, [primed]);

  useEffect(() => {
    if (!primed || !run) {
      if (!primed) setValue(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      // easeOutCubic — fast arrival, soft landing.
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, [target, primed, run]);

  return value;
}

/** True once the node has been on screen, and it stays true. */
function useSeen<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      // No negative inset: the moment any of the strip is on screen the count
      // may start. Insetting the root lets a visible tile sit at zero.
      { rootMargin: "0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return { ref, seen };
}

/**
 * null until we have actually asked the browser. Never assume motion is fine.
 *
 * Resolved in a LAYOUT effect, not a normal one. A normal effect runs after the
 * browser has painted, so the true value would be on screen for a frame before
 * the count-up zeroed it — which looks like the number changing its mind rather
 * than like an animation.
 */
function useReducedMotion(): boolean | null {
  const [reduced, setReduced] = useState<boolean | null>(null);
  useIsomorphicLayoutEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

type Tile = {
  label: string;
  /** null = we could not read it. Renders an em dash, never a zero. */
  value: number | null;
  prefix?: string;
  /** Fixed decimal places; omit for whole numbers. */
  decimals?: number;
  note: string;
  /** Counting up through cents looks broken — animate whole units only. */
  animate?: boolean;
};

function StatTile({ tile, primed, run }: { tile: Tile; primed: boolean; run: boolean }) {
  // A value with decimals counts up through meaningless intermediate cents, and
  // a value we could not read has nothing to count to.
  const canAnimate = primed && tile.animate !== false && tile.value !== null;
  const shown = useCountUp(tile.value ?? 0, canAnimate, run);
  const display = tile.value === null
    ? "—"
    : `${tile.prefix ?? ""}${(canAnimate ? shown : tile.value).toLocaleString("en-US", {
        minimumFractionDigits: tile.decimals ?? 0,
        maximumFractionDigits: tile.decimals ?? 0,
      })}`;

  return (
    <div className="h-full bg-white px-5 py-6 sm:px-6">
      <div className="text-text-xs font-medium uppercase tracking-wider text-gray-500">{tile.label}</div>
      {/* Sans, not the page's serif: a figure in a display face reads as
          decoration. Proportional figures — tabular-nums looks loose at size. */}
      <div className="mt-2 font-sans text-[2rem] font-semibold leading-none tracking-tight text-gray-900 sm:text-[2.25rem]">
        {display}
      </div>
      <div className="mt-2 text-text-sm leading-snug text-gray-600">{tile.note}</div>
    </div>
  );
}

export default function ResultsTicker({ stats }: { stats: ManagedAdsStats }) {
  const { ref, seen } = useSeen<HTMLDivElement>();
  const reduced = useReducedMotion();
  const primed = reduced === false;

  const tiles: Tile[] = [
    {
      label: "Ad spend measured",
      value: stats.spendCents > 0 ? Math.round(stats.spendCents / 100) : null,
      prefix: "$",
      note: "Every dollar we have put through an ad platform for a provider.",
    },
    {
      label: "Clicks delivered",
      value: stats.clicks > 0 ? stats.clicks : null,
      note: "Families who clicked an ad we wrote and landed on a page we built.",
    },
    {
      label: "Family inquiries",
      value: stats.familiesDelivered,
      note: "Server-confirmed, with our own internal traffic stripped out.",
    },
    {
      label: "Cost per inquiry",
      value: stats.costPerInquiryCents !== null ? stats.costPerInquiryCents / 100 : null,
      prefix: "$",
      decimals: 2,
      animate: false,
      note: "The published benchmark for home care is $80 to $150, usually shared.",
    },
    {
      label: "Average cost per click",
      value: stats.avgCpcCents !== null ? stats.avgCpcCents / 100 : null,
      prefix: "$",
      decimals: 2,
      animate: false,
      note: "Home care search runs $5.50 to $6.30 nationally. We buy the tail.",
    },
    {
      label: "Providers advertised",
      value: stats.providersServed > 0 ? stats.providersServed : null,
      note: "Every one teaches the next campaign something the last one paid for.",
    },
  ];

  const fmtDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString("en-US", {
          // Pinned. Without a timeZone this formats in the runtime's local zone,
          // so the server (UTC) and the reader's browser can disagree on the
          // date for any timestamp near midnight, and React reports a hydration
          // mismatch on a line whose whole job is to say when we last checked.
          timeZone: "America/New_York",
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : null;
  const asOf = fmtDate(stats.economicsAsOf);
  const recorded = fmtDate(stats.recordedThrough);

  return (
    <section className="bg-white px-4 pb-10 pt-16 sm:px-6 md:pt-24 lg:px-8" id="results">
      <div className="mx-auto max-w-6xl">
        <h2 className="font-serif text-display-sm md:text-display-md font-bold text-gray-900">
          Every dollar we have spent, and what it bought
        </h2>
        <p className="mt-3 max-w-2xl text-text-md text-gray-600">
          Our whole ledger, not a selected case study. Small, and shown in full.
        </p>

        <div
          ref={ref}
          className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-gray-200 bg-gray-200 shadow-sm md:grid-cols-3"
        >
          {tiles.map((t) => (
            <StatTile key={t.label} tile={t} primed={primed} run={seen} />
          ))}
        </div>

        <p className="mt-4 max-w-3xl text-text-sm leading-relaxed text-gray-500">
          {stats.basis === "verified" ? (
            <>
              Spend, clicks and impressions above are the totals read directly in Google Ads
              {asOf ? <> on {asOf}</> : null}, across every provider campaign. Our own tracker is
              filled in by hand during each optimization sweep and is currently behind that read,
              so we quote the larger figure rather than the flattering one — understating what we
              spent would make the cost per inquiry look better than we earned.
            </>
          ) : (
            <>
              Spend, clicks and impressions are read off Google and Nextdoor by hand during our
              optimization sweep, so they are a floor rather than an estimate
              {recorded ? <> — recorded through {recorded}</> : null}.
            </>
          )}{" "}
          Inquiry counts come from our own event trail with internal traffic removed, which is why
          they run lower than a platform&apos;s conversion column and are the ones we trust.
        </p>
      </div>
    </section>
  );
}

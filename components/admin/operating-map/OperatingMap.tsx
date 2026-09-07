"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  FocusEvent as ReactFocusEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from "react";
import NodeTip from "./NodeTip";
import styles from "./OperatingMap.module.css";

/**
 * The Olera operating map — every step of the marketplace, in one figure.
 *
 * Most nodes carry a live number; the rest render a dash rather than a
 * guess. Wiring a metric is a one-line change at the node, never a layout
 * change: the connectors are computed from measured DOM geometry at draw
 * time, so a card can grow a number, change its label, or change its width
 * and every arrow still lands on it.
 *
 * The one contract that matters: a node's `id` is its identity. `nodeId()`
 * namespaces them so short keys like "m1" cannot collide with anything else
 * rendered on an admin page. Rename a label freely; renaming an id breaks
 * the wire that references it.
 *
 * The figure is laid out at a fixed FIGURE_WIDTH and then scaled to fit the
 * space on screen — both directions, so the whole map is visible at once
 * without scrolling either way. Laying it out at a fixed size and shrinking
 * it keeps every proportion and line break identical at any size; a fluid
 * layout would reflow labels and quietly change the shape of the funnel on
 * different monitors.
 */

/**
 * The width the figure is designed at. Everything scales from here.
 *
 * Deliberately wider than the space it usually lands in. The figure is
 * height-limited on every normal screen — six levels deep on the left — so
 * widening the design costs nothing in scale and spends the horizontal room
 * that was otherwise going to waste, while letting the type be set larger
 * for the same rendered height.
 */
const FIGURE_WIDTH = 1900;

/**
 * Below this the type is too small to read, so we stop shrinking and let
 * the page scroll instead. Only reachable in a very small window.
 */
const MIN_SCALE = 0.4;

/** Breathing room kept below the figure when fitting it to the viewport. */
const BOTTOM_GUTTER = 16;

/** Namespace every DOM id this component owns. */
const nodeId = (key: string) => `om-${key}`;

/** Placeholder for a node with no confident data source yet. */
const NOT_INSTRUMENTED = "—";

/** A city Olera has live providers in, as /api/admin/operating-map/cities returns it. */
interface City {
  city: string;
  state: string;
  slug: string;
  providers: number;
}

type CitiesState =
  | { status: "loading" }
  | { status: "ready"; cities: City[]; truncated: boolean }
  | { status: "error" };

/** One instrumented node, as /api/admin/operating-map/metrics returns it. */
export interface MetricNode {
  value: number | null;
  /** Named parts printed under the node's label. Null renders as a dash. */
  breakdown?: { label: string; value: number | null }[];
  /** Live caveat, shown in the tooltip only — never as text on the card. */
  caveat?: string | null;
}

export type MetricNodes = Record<string, MetricNode | undefined>;

/**
 * One node's direction, as /api/admin/operating-map/trends returns it.
 *
 * Eight fixed weeks, regardless of the range on screen, so the colour means
 * the same thing whatever period is selected. The colour reads the last week
 * against the one before; the arrow reads four weeks against the four before.
 */
export interface NodeTrend {
  /** -3 to +3. Zero is flat. */
  score: number;
  /** Week-over-week change as a fraction, or null when there was no baseline. */
  weekChange: number | null;
  monthDirection: -1 | 0 | 1;
  week: { now: number; prior: number };
  month: { now: number; prior: number };
  /** Eight consecutive weeks, oldest first. The sparkline in the panel. */
  series: number[];
}

export type NodeTrends = Record<string, NodeTrend | undefined>;

/** The class that paints a value its trend colour. Flat keeps ordinary ink. */
export function toneClass(score: number): string | null {
  const step = Math.min(3, Math.abs(score));
  if (step === 0) return null;
  return styles[score > 0 ? `tUp${step}` : `tDown${step}`] ?? null;
}

/**
 * What a node's number means, in the fewest words that still let someone act
 * on it: what is counted, where it comes from, how to read it. Only nodes
 * that show a number get one — a dash needs no explanation.
 */
const NODE_HELP: Record<string, string> = {
  cities:
    "Cities with at least one live provider. Wider than the cities we have deliberately launched.",
  traffic:
    "Every visitor to a provider, benefits or editorial page, however they arrived. The ten channels below account for all of it — GA4 is the cross-check on the total, the split is our own.",
  cr1:
    "The two care seeker actions that produce a record we can work. Questions are counted elsewhere and left out here — they are the cheapest ask and would swamp the other two.",
  cr2:
    "Families we emailed in this range, counted once each however many times we wrote. The mirror of providers in outreach and advisors in outreach.",
  cp1:
    "Providers in the directory nobody has claimed — the supply outreach works through. Scoped by the provider's city. A standing count, so the date range does not change it.",
  cp2:
    "Unclaimed providers who heard from us in this range — any email, call or MedJobs contact. Counts providers, not messages, so twenty emails to one provider is one.",
  m1:
    "Care seeker profiles begun in this range and how far they got. The parts nest: every profile is at least partial, completed means finished, live means the care post is published.",
  m2:
    "Providers who became active in this range — claiming the listing is all it takes — and how many of those went on to pass verification.",
  m3:
    "Providers who requested a managed ad campaign in this range. Repeat counts providers who have asked more than once, over all time.",
  m4: "Providers who activated MedJobs staffing in this range.",
  m5:
    "MedJobs applications begun and how many are finished — a profile goes live once the intro video and documents are in. Channels activated has no source yet.",
  cw1:
    "Universities we are working and the advisors on file at them, scoped by the university's city. A standing count — the date range does not change it.",
  cw2:
    "Advisors we have actually contacted — at least one touchpoint against them. The gap from CW1's advisor count is supply we have not tried yet.",
  ta1:
    "Families who told us they are moving forward with a benefit. Applying happens on a government site, so this is their own report — a floor, not a count.",
  tb1:
    "Families and providers who actually connected, by the same rule the Connections page uses: a provider reply, a confirmation from either side, or an admin marking it.",
  tc1: "Interviews with a time agreed, and how many were recorded as held. Scheduled includes the ones since completed.",
  tc2: "Placements the care worker accepted.",
};

/** Tooltip anchored to a node, positioned outside the scaled figure. */
interface Tip {
  text: string;
  /** Which node opened it — the panel derives everything else from this. */
  nodeKey: string;
  caveat?: string | null;
  trend?: NodeTrend | null;
  x: number;
  y: number;
}

export default function OperatingMap({
  selectedCity,
  onSelectCity,
  nodes,
  trends,
  metricsLoading,
  onInspect,
  showNumbers = true,
  controls,
}: {
  /** Slug of the city the map is scoped to, or null for all cities. */
  selectedCity: string | null;
  onSelectCity: (slug: string | null) => void;
  /** Instrumented node values, keyed by node id. Missing = not instrumented. */
  nodes: MetricNodes;
  /** Direction per node. Arrives after the values; missing = uncoloured. */
  trends: NodeTrends;
  metricsLoading: boolean;
  /** Open the receipts for a node. Omitted when inspection is unavailable. */
  onInspect?: (nodeKey: string) => void;
  /** False strips every value, dash and marker, leaving the structure. */
  showNumbers?: boolean;
  /**
   * The view's own period and visibility controls, rendered beside the city
   * picker so scope and period read as one row instead of two.
   */
  controls?: ReactNode;
}) {
  const [cities, setCities] = useState<CitiesState>({ status: "loading" });
  const [tip, setTip] = useState<Tip | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const rootWrapRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const draw = useCallback(() => {
    const sys = rootRef.current;
    const svg = svgRef.current;
    const fit = fitRef.current;
    const stage = stageRef.current;
    if (!sys || !svg || !fit || !stage) return;

    // Fit the figure to the space we were given, in both directions: the
    // map is only worth drawing as one picture if the whole picture is on
    // screen. Written before measuring, so the geometry below is read from
    // the layout we actually ship.
    const availableW = fit.clientWidth;
    // Distance from the top of the document, so a scrolled page cannot
    // inflate the room we think we have.
    const docTop = fit.getBoundingClientRect().top + window.scrollY;
    const availableH = document.documentElement.clientHeight - docTop - BOTTOM_GUTTER;
    const figureHeight = sys.offsetHeight;
    const byWidth = availableW > 0 ? availableW / FIGURE_WIDTH : 1;
    const byHeight = availableH > 0 && figureHeight > 0 ? availableH / figureHeight : 1;
    // Rounded so sub-pixel jitter cannot ping-pong between two scales.
    const scale = Math.max(
      MIN_SCALE,
      Math.round(Math.min(1, byWidth, byHeight) * 1000) / 1000,
    );
    const nextTransform = scale < 1 ? `scale(${scale})` : "";
    if (sys.style.transform !== nextTransform) sys.style.transform = nextTransform;

    // A transform paints smaller but still occupies its full layout box, so
    // the figure would keep reserving FIGURE_WIDTH and grow a scrollbar the
    // scaling was meant to remove. The stage is sized to what you actually
    // see and clips the untransformed box behind it.
    const stageWidth = `${Math.ceil(FIGURE_WIDTH * scale)}px`;
    const stageHeight = `${Math.ceil(figureHeight * scale)}px`;
    if (stage.style.width !== stageWidth) stage.style.width = stageWidth;
    if (stage.style.height !== stageHeight) stage.style.height = stageHeight;

    const SVG_NS = "http://www.w3.org/2000/svg";
    /** Gap left between a card's edge and the arrow that touches it. */
    const G = 5;

    // Unscaled layout dimensions: getBoundingClientRect below is divided by
    // the same scale, so the SVG and the measurements share one coordinate
    // space no matter what the figure is rendered at.
    const w = sys.scrollWidth;
    const h = sys.scrollHeight;
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.setAttribute("width", String(w));
    svg.setAttribute("height", String(h));
    svg.replaceChildren();

    type Box = { l: number; r: number; t: number; b: number; cx: number; cy: number };

    /** Measure a node in the figure's own coordinate space. */
    function box(key: string): Box {
      const node = document.getElementById(nodeId(key));
      if (!node) throw new Error(`operating map: missing node "${key}"`);
      const r = node.getBoundingClientRect();
      const c = sys!.getBoundingClientRect();
      // Both rects are scaled by the same factor, so dividing the deltas by
      // it returns unscaled figure coordinates.
      const k = scale;
      return {
        l: (r.left - c.left) / k,
        r: (r.right - c.left) / k,
        t: (r.top - c.top) / k,
        b: (r.bottom - c.top) / k,
        cx: ((r.left + r.right) / 2 - c.left) / k,
        cy: ((r.top + r.bottom) / 2 - c.top) / k,
      };
    }

    function seg(x1: number, y1: number, x2: number, y2: number) {
      const ln = document.createElementNS(SVG_NS, "line");
      ln.setAttribute("x1", String(x1));
      ln.setAttribute("y1", String(y1));
      ln.setAttribute("x2", String(x2));
      ln.setAttribute("y2", String(y2));
      svg!.appendChild(ln);
    }

    function head(x: number, y: number, dir: "d" | "r") {
      const p = document.createElementNS(SVG_NS, "polygon");
      p.setAttribute(
        "points",
        dir === "d"
          ? [`${x},${y}`, `${x - 4.4},${y - 8}`, `${x + 4.4},${y - 8}`].join(" ")
          : [`${x},${y}`, `${x - 8},${y - 4.4}`, `${x - 8},${y + 4.4}`].join(" "),
      );
      svg!.appendChild(p);
    }

    const vArrow = (x: number, y1: number, y2: number) => {
      seg(x, y1, x, y2 - 8);
      head(x, y2, "d");
    };
    const hArrow = (y: number, x1: number, x2: number) => {
      seg(x1, y, x2 - 8, y);
      head(x2, y, "r");
    };

    const vDown = (a: string, b: string) => {
      const A = box(a);
      const B = box(b);
      vArrow(A.cx, A.b + G, B.t - G);
    };
    /** Branch off a vertical stem into a card sitting to its right. */
    const fromStem = (x: number, b: string) => {
      const B = box(b);
      hArrow(B.cy, x + 1, B.l - G);
    };
    /** The line every top-section drop terminates on. */
    const BT = box("bottom").t - G;

    const traffic = box("traffic");
    const cp2 = box("cp2");

    /* families engaged, then the ones we contact */
    vDown("cr1", "cr2");
    const cr2 = box("cr2");
    vArrow(cr2.cx, cr2.b + G, BT);

    /* care provider */
    vDown("cp1", "cp2");
    seg(cp2.cx, cp2.b + G, cp2.cx, BT - 8);
    head(cp2.cx, BT, "d");

    /* care worker runs straight down its lane and into the milestone layer */
    vDown("cw1", "cw2");
    const cw2 = box("cw2");
    vArrow(cw2.cx, cw2.b + G, BT);

    /* inside the tracks */
    vDown("ta1", "ta2");
    vDown("tb1", "tb2");
    vDown("tc1", "tc2");

    /*
     * Aid and care converge on the spending outcome, care workers on their
     * own. The bar is stretched to cover the outcome's centre as well as the
     * two tracks feeding it — otherwise the drop comes off the end of the
     * bar and reads as a line crossing rather than a join.
     */
    const ta2 = box("ta2");
    const tb2 = box("tb2");
    const tc2 = box("tc2");
    const o1 = box("o1");
    const o2 = box("o2");

    const outBar = Math.max(ta2.b, tb2.b) + 24;
    seg(ta2.cx, ta2.b + G, ta2.cx, outBar);
    seg(tb2.cx, tb2.b + G, tb2.cx, outBar);
    seg(
      Math.min(ta2.cx, tb2.cx, o1.cx),
      outBar,
      Math.max(ta2.cx, tb2.cx, o1.cx),
      outBar,
    );
    vArrow(o1.cx, outBar, o1.t - G);

    /* the care worker track has one outcome of its own */
    if (Math.abs(tc2.cx - o2.cx) < 1) {
      vArrow(tc2.cx, tc2.b + G, o2.t - G);
    } else {
      const bar2 = tc2.b + 24;
      seg(tc2.cx, tc2.b + G, tc2.cx, bar2);
      seg(tc2.cx, bar2, o2.cx, bar2);
      vArrow(o2.cx, bar2, o2.t - G);
    }
  }, []);

  useLayoutEffect(() => {
    // Two passes: once on mount, once after the web font settles. Inter
    // changes card heights, and every arrow is measured from those heights.
    draw();
    const node = rootRef.current;
    if (!node) return;

    // ResizeObserver reports layout size, which the transform does not
    // affect, so watching both the wrapper (available width) and the figure
    // (content height) cannot feed back into itself.
    const observer = new ResizeObserver(() => draw());
    observer.observe(node);
    if (fitRef.current) observer.observe(fitRef.current);

    let cancelled = false;
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (!cancelled) draw();
      });
    }

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [draw]);

  useEffect(() => {
    const onResize = () => draw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [draw]);

  // A value or its caveat can change a card's height, and every arrow is
  // measured from those heights.
  useLayoutEffect(() => {
    // Values change card heights, and every arrow is measured from those.
    draw();
  }, [draw, nodes, metricsLoading, showNumbers]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/operating-map/cities", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("cities failed"))))
      .then((d) =>
        setCities({
          status: "ready",
          cities: (d.cities ?? []) as City[],
          truncated: Boolean(d.truncated),
        }),
      )
      .catch((e: unknown) => {
        if ((e as Error)?.name === "AbortError") return;
        // No fallback number: the top node is the scope everything else is
        // read against, so a wrong count there is worse than no count.
        setCities({ status: "error" });
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPickerOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen]);

  const active = useMemo(
    () =>
      cities.status === "ready"
        ? cities.cities.find((c) => c.slug === selectedCity) ?? null
        : null,
    [cities, selectedCity],
  );

  const pillLabel = active
    ? `${active.city}, ${active.state}`
    : "All cities";

  /**
   * Anchor a tooltip under the element that triggered it. Measured against
   * the unscaled root so the tooltip renders at full size, whatever the
   * figure has been scaled to.
   */
  // draw() has no dependencies by design — it measures the DOM rather than
  // reading state — so the arrow labels reach it through a ref, and the
  // effect below redraws when they land.
  const inspectRef = useRef<((nodeKey: string) => void) | undefined>(undefined);
  inspectRef.current = onInspect;
  // draw() is deliberately dependency-free, so the tooltip it opens for the
  // wire counts arrives the same way their values do.
  const tipRef = useRef<{
    open: TipOpener;
    close: () => void;
    trends: NodeTrends;
  } | null>(null);

  /*
   * The panel carries links, so it has to survive the pointer travelling
   * from the number into it. A short grace period on leave, cancelled when
   * the pointer lands inside, is the whole mechanism.
   */
  const closeTimer = useRef<number | null>(null);
  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);
  const closeTip = useCallback(() => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setTip(null), 140);
  }, [cancelClose]);

  const openTip = useCallback((
    el: HTMLElement,
    key: string,
    caveat?: string | null,
    trend?: NodeTrend | null,
  ) => {
    const text = NODE_HELP[key];
    if (!text) return;
    const root = rootWrapRef.current;
    if (!root) return;
    cancelClose();
    const r = el.getBoundingClientRect();
    const c = root.getBoundingClientRect();
    const TIP_WIDTH = 320;
    // Roughly what the panel occupies with a sparkline, a diagnosis and a
    // link. Only used to decide which side of the number to open on, so an
    // approximation is enough.
    const TIP_HEIGHT = 250;
    // Keep it inside the wrapper rather than letting it hang off the edge.
    const x = Math.min(Math.max(r.left - c.left - 8, 8), Math.max(c.width - TIP_WIDTH - 8, 8));
    const below = r.bottom - c.top + 8;
    // Nodes low in the figure open upwards, so the panel is never mostly
    // off the bottom of the page.
    const y = below + TIP_HEIGHT > c.height ? Math.max(8, r.top - c.top - TIP_HEIGHT) : below;
    setTip({ text, nodeKey: key, caveat, trend, x, y });
  }, [cancelClose]);

  // Read at hover time rather than at draw time, so the wire counts pick up
  // trends that arrive after the figure was last drawn.
  tipRef.current = { open: openTip, close: closeTip, trends };

  return (
    <div className={styles.root} ref={rootWrapRef} style={{ position: "relative" }}>
      {tip && (
        <NodeTip
          text={tip.text}
          nodeKey={tip.nodeKey}
          caveat={tip.caveat}
          metric={nodes[tip.nodeKey]}
          trend={tip.trend}
          trends={trends}
          tone={tip.trend ? toneClass(tip.trend.score) : null}
          inspectable={INSPECTABLE.has(tip.nodeKey)}
          x={tip.x}
          y={tip.y}
          onEnter={cancelClose}
          onLeave={closeTip}
        />
      )}
      {/*
        Scope and period on one line, above the figure rather than inside it.
        Everything inside .fit is scaled to fit the screen, so a control
        rendered in there would shrink along with the map.
      */}
      <div className={styles.controls} ref={pickerRef}>
        <div style={{ position: "relative" }}>
            <button
              type="button"
              className={styles.filterPill}
              onClick={() => setPickerOpen((v) => !v)}
              aria-expanded={pickerOpen}
              aria-haspopup="listbox"
              onMouseEnter={(e) => openTip(e.currentTarget, "cities")}
              onMouseLeave={closeTip}
              onFocus={(e) => openTip(e.currentTarget, "cities")}
              onBlur={closeTip}
            >
              {pillLabel}
              {!active && (
                <span className={styles.filterCount}>
                  {cities.status === "ready"
                    ? `${cities.truncated ? "≥" : ""}${cities.cities.length.toLocaleString()}`
                    : cities.status === "loading"
                      ? "…"
                      : NOT_INSTRUMENTED}
                </span>
              )}
              {active && (
                <span className={styles.filterCount}>
                  {active.providers.toLocaleString()} providers
                </span>
              )}
              <span className={styles.filterCaret}>▼</span>
            </button>
            {pickerOpen && (
              <div className={styles.picker} role="listbox">
                <button
                  type="button"
                  className={styles.pickerItem}
                  aria-current={!selectedCity}
                  onClick={() => {
                    onSelectCity(null);
                    setPickerOpen(false);
                  }}
                >
                  <span>All cities</span>
                  {cities.status === "ready" && (
                    <span className={styles.pickerCount}>
                      {cities.cities.length.toLocaleString()}
                    </span>
                  )}
                </button>
                {cities.status === "ready" &&
                  cities.cities.map((c) => (
                    <button
                      key={c.slug}
                      type="button"
                      className={styles.pickerItem}
                      aria-current={c.slug === selectedCity}
                      onClick={() => {
                        onSelectCity(c.slug);
                        setPickerOpen(false);
                      }}
                    >
                      <span>{`${c.city}, ${c.state}`}</span>
                      <span className={styles.pickerCount}>
                        {c.providers.toLocaleString()}
                      </span>
                    </button>
                  ))}
                {cities.status === "loading" && (
                  <div className={styles.pickerNote}>Loading cities…</div>
                )}
                {cities.status === "error" && (
                  <div className={styles.pickerNote}>
                    Could not load cities. The count is not reported as zero.
                  </div>
                )}
                {cities.status === "ready" && cities.truncated && (
                  <div className={styles.pickerNote}>
                    Row ceiling reached — this list is a floor, not the full set.
                  </div>
                )}
              </div>
            )}
        </div>
        {/*
          All traffic is a filter's twin, not a step: it states the size of
          the world the map covers, the same way the city picker states its
          boundary. Both read as controls, so both look like controls.
        */}
        <button
          type="button"
          id={nodeId("traffic")}
          className={styles.filterPill}
          onMouseEnter={(e) =>
            openTip(e.currentTarget, "traffic", nodes.traffic?.caveat, trends.traffic)
          }
          onMouseLeave={closeTip}
          onFocus={(e) =>
            openTip(e.currentTarget, "traffic", nodes.traffic?.caveat, trends.traffic)
          }
          onBlur={closeTip}
          onClick={() => onInspect?.("traffic")}
        >
          All traffic
          {showNumbers && (
            <span className={styles.filterCount}>
              {metricsLoading
                ? "…"
                : typeof nodes.traffic?.value === "number"
                  ? nodes.traffic.value.toLocaleString()
                  : NOT_INSTRUMENTED}
            </span>
          )}
        </button>
        {controls}
      </div>

      <div className={styles.fit} ref={fitRef}>
        <div className={styles.stage} ref={stageRef}>
          <section className={styles.system} ref={rootRef}>
          <svg className={styles.wires} ref={svgRef} role="presentation" />

          <div className={styles.topStat}>
            <span className={styles.lab}>Revenue generated</span>
            {showNumbers && <span className={styles.v}>{NOT_INSTRUMENTED}</span>}
          </div>

          <div className={styles.lanes3} style={{ marginBottom: 8 }}>
            <div className={styles.lab}>Care seeker</div>
            <div className={styles.lab}>Care provider</div>
            <div className={styles.lab}>Care worker</div>
          </div>

          {/* ---------------- top ---------------- */}
          <div className={styles.lanes3}>
            {/* care recipient */}
            <div className={styles.lane}>
              <div className={`${styles.chips} ${styles.solo}`}>
                <Card
                  id="cr1"
                  code="CR1"
                  label="Families engaged"
                  parts="connect requests · benefits assessments"
                  metric={nodes.cr1}
                  trend={trends.cr1}
                  loading={metricsLoading}
                  onTip={openTip}
                  onTipClose={closeTip}
                  onInspect={onInspect}
                  showNumbers={showNumbers}
                />
              </div>
              <div style={{ marginTop: 22 }}>
                <Card
                  id="cr2"
                  code="CR2"
                  label="Families in outreach"
                  metric={nodes.cr2}
                  trend={trends.cr2}
                  loading={metricsLoading}
                  onTip={openTip}
                  onTipClose={closeTip}
                  onInspect={onInspect}
                  showNumbers={showNumbers}
                />
              </div>
            </div>

            {/* care provider */}
            <div className={styles.lane}>
              <div className={`${styles.chips} ${styles.solo}`}>
                <Card
                  id="cp1"
                  code="CP1"
                  label="Unclaimed providers"
                  metric={nodes.cp1}
                  trend={trends.cp1}
                  loading={metricsLoading}
                  onTip={openTip}
                  onTipClose={closeTip}
                  onInspect={onInspect}
                  showNumbers={showNumbers}
                />
              </div>
              <div className={styles.soloWrap}>
                <Card
                  id="cp2"
                  code="CP2"
                  label="Providers in outreach"
                  metric={nodes.cp2}
                  trend={trends.cp2}
                  loading={metricsLoading}
                  onTip={openTip}
                  onTipClose={closeTip}
                  onInspect={onInspect}
                  showNumbers={showNumbers}
                />
              </div>
            </div>

            {/* care worker */}
            <div className={styles.lane}>
              <Card
                id="cw1"
                code="CW1"
                label="Universities targeted"
                  parts="universities · advisors"
                metric={nodes.cw1}
                trend={trends.cw1}
                loading={metricsLoading}
                onTip={openTip}
                onTipClose={closeTip}
                onInspect={onInspect}
                  showNumbers={showNumbers}
              />
              <div className={styles.gap} />
              <Card
                id="cw2"
                code="CW2"
                label="Advisors in outreach"
                metric={nodes.cw2}
                trend={trends.cw2}
                loading={metricsLoading}
                onTip={openTip}
                onTipClose={closeTip}
                onInspect={onInspect}
                  showNumbers={showNumbers}
              />
              <div className={styles.gap} />
            </div>
          </div>

          <div style={{ height: 30 }} />

          {/* ---------------- bottom ---------------- */}
          <div id={nodeId("bottom")}>
            <div className={`${styles.col} ${styles.strip}`}>
              <span className={styles.lab}>User milestone</span>
              <div className={styles.stripRow}>
                <Card
                  hi
                  id="m1"
                  code="M1"
                  label="Care seeker profiles"
                  parts="partial · completed · live"
                  metric={nodes.m1}
                  trend={trends.m1}
                  loading={metricsLoading}
                  onTip={openTip}
                  onTipClose={closeTip}
                  onInspect={onInspect}
                  showNumbers={showNumbers}
                />
                <Card
                  hi
                  id="m2"
                  code="M2"
                  label="Active providers"
                  parts="claimed · verified"
                  metric={nodes.m2}
                  trend={trends.m2}
                  loading={metricsLoading}
                  onTip={openTip}
                  onTipClose={closeTip}
                  onInspect={onInspect}
                  showNumbers={showNumbers}
                />
                <Card
                  hi
                  id="m3"
                  code="M3" money="Paid product"
                  label="Managed ads"
                  parts="signups · repeat"
                  metric={nodes.m3}
                  trend={trends.m3}
                  loading={metricsLoading}
                  onTip={openTip}
                  onTipClose={closeTip}
                  onInspect={onInspect}
                  showNumbers={showNumbers}
                />
                <Card
                  hi
                  id="m4"
                  code="M4"
                  label="Provider staffing signups"
                  metric={nodes.m4}
                  trend={trends.m4}
                  loading={metricsLoading}
                  onTip={openTip}
                  onTipClose={closeTip}
                  onInspect={onInspect}
                  showNumbers={showNumbers}
                />
                <Card
                  hi
                  id="m5"
                  code="M5"
                  label="Care worker profiles"
                  parts="channels · started · complete"
                  metric={nodes.m5}
                  trend={trends.m5}
                  loading={metricsLoading}
                  onTip={openTip}
                  onTipClose={closeTip}
                  onInspect={onInspect}
                  showNumbers={showNumbers}
                />
              </div>
            </div>

            <div className={styles.tracks}>
              <div className={styles.col} id={nodeId("ta")}>
                <span className={styles.lab}>TA aid establishment</span>
                <div className={styles.stack}>
                  <Card
                    id="ta1"
                    code="TA1"
                    label="Applied"
                    metric={nodes.ta1}
                    trend={trends.ta1}
                    loading={metricsLoading}
                    onTip={openTip}
                    onTipClose={closeTip}
                    onInspect={onInspect}
                    showNumbers={showNumbers}
                  />
                  <Card id="ta2" code="TA2" label="Aid confirmed" />
                </div>
              </div>

              <div className={styles.col} id={nodeId("tb")}>
                <span className={styles.lab}>TB care establishment</span>
                <div className={styles.stack}>
                  <Card
                    id="tb1"
                    code="TB1"
                    label="Family–provider connected"
                    metric={nodes.tb1}
                    trend={trends.tb1}
                    loading={metricsLoading}
                    onTip={openTip}
                    onTipClose={closeTip}
                    onInspect={onInspect}
                    showNumbers={showNumbers}
                  />
                  <Card id="tb2" code="TB2" label="Care confirmed" />
                </div>
              </div>

              <div className={styles.col} id={nodeId("tc")}>
                <span className={styles.lab}>TC care worker hiring</span>
                <div className={styles.stack}>
                  <Card
                    id="tc1"
                    code="TC1"
                    label="Interviews"
                  parts="scheduled · completed"
                    metric={nodes.tc1}
                    trend={trends.tc1}
                    loading={metricsLoading}
                    onTip={openTip}
                    onTipClose={closeTip}
                    onInspect={onInspect}
                    showNumbers={showNumbers}
                  />
                  <Card
                    id="tc2"
                    code="TC2"
                    money="Revenue generating"
                    label="Hires confirmed"
                    metric={nodes.tc2}
                    trend={trends.tc2}
                    loading={metricsLoading}
                    onTip={openTip}
                    onTipClose={closeTip}
                    onInspect={onInspect}
                    showNumbers={showNumbers}
                  />
                </div>
              </div>
            </div>

            <div className={styles.outrow}>
              <Card
                hi
                id="o1"
                code="O1"
                money="Value created"
                label="Est. healthcare utilization reduction"
              />
              <Card
                hi
                id="o2"
                code="O2"
                money="Value created"
                label="Est. new care workers"
              />
            </div>
          </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Card({
  id,
  code,
  label,
  parts,
  hi,
  money,
  metric,
  trend,
  loading,
  onTip,
  onTipClose,
  onInspect,
  showNumbers,
}: {
  id: string;
  code: string;
  /** Sits on the same line as the code. Two lines for a name is one too many. */
  label: string;
  /**
   * Placeholder for the breakdown line, shown before the node is
   * instrumented. Its presence is what gives the card a second line at all.
   */
  parts?: string;
  hi?: boolean;
  /** Tooltip shown on the $ marker. Omit for nodes that carry no money. */
  money?: string;
  metric?: MetricNode;
  trend?: NodeTrend;
  loading?: boolean;
  onTip?: TipOpener;
  onTipClose?: () => void;
  onInspect?: (nodeKey: string) => void;
  showNumbers?: boolean;
}) {
  return (
    <div className={`${styles.card}${hi ? ` ${styles.hi}` : ""}`} id={nodeId(id)}>
      <div className={styles.cardHead}>
        <div className={styles.k}>
          {code}
          {money && (
            <span className={styles.paid} title={money}>
              $
            </span>
          )}
          <span className={styles.name}>{label}</span>
        </div>
        <span style={{ whiteSpace: "nowrap" }}>
          <MetricValue
            metric={metric}
            trend={trend}
            loading={loading}
            nodeKey={id}
            onInspect={onInspect}
            onTip={onTip}
            onTipClose={onTipClose}
            showNumbers={showNumbers}
          />
        </span>
      </div>
      {parts && showNumbers && (
        <div className={styles.n}>
          <Surfaces metric={metric} fallback={parts} showNumbers={showNumbers} />
        </div>
      )}
    </div>
  );
}

function Chip({
  id,
  code,
  label,
  metric,
  trend,
  loading,
  onTip,
  onTipClose,
  onInspect,
  showNumbers,
}: {
  id: string;
  code: string;
  label: string;
  metric?: MetricNode;
  trend?: NodeTrend;
  loading?: boolean;
  onTip?: TipOpener;
  onTipClose?: () => void;
  onInspect?: (nodeKey: string) => void;
  showNumbers?: boolean;
}) {
  return (
    <div className={styles.chip} id={nodeId(id)}>
      <div className={styles.chipHead}>
        <span>
          <b>{code}</b>
          <span className={styles.name}>{label}</span>
        </span>
        <span style={{ whiteSpace: "nowrap" }}>
          <MetricValue
            metric={metric}
            trend={trend}
            loading={loading}
            nodeKey={id}
            onInspect={onInspect}
            onTip={onTip}
            onTipClose={onTipClose}
            showNumbers={showNumbers}
          />
        </span>
      </div>
    </div>
  );
}

export type TipOpener = (
  el: HTMLElement,
  key: string,
  caveat?: string | null,
  trend?: NodeTrend | null,
) => void;

/**
 * The three surfaces CR1 spans. This line already named them; instrumenting
 * the node fills in the numbers rather than adding a row of its own.
 */
function Surfaces({
  metric,
  fallback,
  showNumbers = true,
}: {
  metric?: MetricNode;
  /** Shown before the node is instrumented. */
  fallback?: string;
  showNumbers?: boolean;
}) {
  // With numbers off this line is only separators and the words between
  // them — reporting furniture with nothing left to report.
  if (!showNumbers) return null;
  const parts = metric?.breakdown;
  if (!parts?.length) {
    return (
      <span className={styles.dim}>
        {fallback ?? "provider page · editorial page · benefits page"}
      </span>
    );
  }
  return (
    <span className={styles.dim}>
      {parts.map((p, i) => (
        <span key={p.label}>
          {i > 0 && " · "}
          {p.label}{" "}
          <b className={styles.surfaceValue}>
            {/* Null is a part with no source yet, not a zero. */}
            {p.value === null ? NOT_INSTRUMENTED : p.value.toLocaleString()}
          </b>
        </span>
      ))}
    </span>
  );
}

/** The number, or an honest placeholder. Never a zero standing in for
 *  "we don't know". */
function MetricValue({
  metric,
  trend,
  loading,
  nodeKey,
  onInspect,
  onTip,
  onTipClose,
  showNumbers = true,
}: {
  metric?: MetricNode;
  trend?: NodeTrend;
  loading?: boolean;
  nodeKey?: string;
  onInspect?: (nodeKey: string) => void;
  onTip?: TipOpener;
  onTipClose?: () => void;
  showNumbers?: boolean;
}) {
  // With numbers off there is nothing to say here, not even that we do not
  // know — a dash is still reporting.
  if (!showNumbers) return null;

  // Hovering the number opens its explanation. There is no separate icon:
  // one on every card was a field of small glyphs to look past, and the
  // number is the thing you are already looking at.
  const explains = Boolean(onTip && nodeKey && NODE_HELP[nodeKey]);
  const hover = explains
    ? {
        onMouseEnter: (e: ReactMouseEvent<HTMLElement>) =>
          onTip!(e.currentTarget, nodeKey!, metric?.caveat, trend ?? null),
        onMouseLeave: onTipClose,
        onFocus: (e: ReactFocusEvent<HTMLElement>) =>
          onTip!(e.currentTarget, nodeKey!, metric?.caveat, trend ?? null),
        onBlur: onTipClose,
      }
    : {};

  const placeholder = (text: string) => (
    // Wrapped like a real value so a node without a number is exactly as
    // tall as one with a number and an arrow. The arrows are measured
    // geometry; uneven card heights would move every wire on the page.
    <span className={styles.valueWrap}>
      <span className={`${styles.value} ${styles.valueMuted}`} {...hover}>
        {text}
      </span>
      <span className={styles.trendArrow} aria-hidden="true" />
    </span>
  );

  if (!metric) return placeholder(NOT_INSTRUMENTED);
  if (loading) return placeholder("…");
  if (metric.value === null) return placeholder(NOT_INSTRUMENTED);

  const text = metric.value.toLocaleString();
  const tone = trend ? toneClass(trend.score) : null;
  const arrow =
    trend && trend.monthDirection !== 0 ? (trend.monthDirection > 0 ? "▲" : "▼") : null;

  // A number you can open is a number you can check. Nodes without a source
  // descriptor stay plain text rather than offering a dead click.
  const inspectable = Boolean(onInspect && nodeKey && INSPECTABLE.has(nodeKey));

  return (
    <span className={styles.valueWrap}>
      {inspectable ? (
        <button
          type="button"
          className={`${styles.value} ${styles.valueButton}${tone ? ` ${tone}` : ""}`}
          onClick={() => onInspect!(nodeKey!)}
          {...hover}
        >
          {text}
        </button>
      ) : (
        <span className={`${styles.value}${tone ? ` ${tone}` : ""}`} {...hover}>
          {text}
        </span>
      )}
      {/* Always rendered, empty when there is no direction, so the slot
          reserves the same height on every card. */}
      <span className={`${styles.trendArrow}${tone ? ` ${tone}` : ""}`} aria-hidden="true">
        {arrow}
      </span>
    </span>
  );
}

/** Nodes the inspect endpoint can produce rows for. */
const INSPECTABLE = new Set([
  "traffic", "cr2",
  "cp1", "cp2",
  "m1", "m2", "m3", "m4", "m5",
  "cw1", "cw2",
  "ta1", "tb1", "tc1", "tc2",
]);



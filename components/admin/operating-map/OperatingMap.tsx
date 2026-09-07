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
 * namespaces them so short keys like "s3" cannot collide with anything else
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
 * The index system, and what it is claiming.
 *
 * A one-letter code is a lane and the number is how far down it: S for the
 * care seeker, P for the care provider, W for the care worker. A two-letter
 * code is a join — it names the two lanes that feed it, and sits between
 * them in the figure. O is an outcome: an estimate of value created, not a
 * count of anything that happened.
 *
 * The code is also the node's key, end to end — DOM id, metric, trend,
 * drill-down source, consistency check. Renaming a label is free; renaming
 * a code means renaming it in all five places or the map starts answering
 * a different question than the one you clicked.
 */

/**
 * What a node's number means, in the fewest words that still let someone act
 * on it: what is counted, where it comes from, how to read it. Only nodes
 * that show a number get one — a dash needs no explanation.
 */
const NODE_HELP: Record<string, string> = {
  cities:
    "Cities with at least one live provider. Wider than the cities we have deliberately launched.",

  s1:
    "The two care seeker actions that produce a record we can work. Questions are the cheapest ask and would swamp the other two, so they are counted elsewhere. Below it, the traffic all of this comes out of.",
  s2:
    "Families we emailed in this range, counted once each however many times we wrote. The mirror of providers in outreach and advisors in outreach.",
  s3: "Care seeker profiles begun in this range, at any stage of completion.",
  s4:
    "Families who told us they are moving forward with a benefit. Applying happens on a government site, so this is their own report — a floor, not a count.",

  p1:
    "Providers in the directory nobody has claimed — the supply outreach works through. Scoped by the provider's city. A standing count, so the date range does not change it.",
  p2:
    "Unclaimed providers who heard from us in this range — any email, call or MedJobs contact. Counts providers, not messages, so twenty emails to one provider is one.",
  p3:
    "Providers who became active in this range. Claiming the listing is all it takes — verification is a further step, counted separately.",
  p4: "Providers who requested a managed ad campaign in this range.",
  p5: "Providers who activated MedJobs staffing in this range.",

  w1:
    "Universities we are working, scoped by the university's city. A standing count — the date range does not change it.",
  w2:
    "Advisors we have actually contacted — at least one touchpoint against them. The gap from the advisors on file is supply we have not tried yet.",
  w3:
    "MedJobs applications begun and how many are finished — a profile goes live once the intro video and documents are in. Channels activated has no source yet.",

  sp1:
    "Families and providers who actually connected, by the same rule the Connections page uses: a provider reply, a confirmation from either side, or an admin marking it.",

  pw1:
    "Interviews with a time agreed — the point a provider and a care worker are actually in contact. Counts scheduled, including the ones since held.",
  pw2: "Placements the care worker accepted.",
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
    /*
     * Every arrow is a claim about what causes what, so the geometry makes
     * the same claim: a lane's own steps run down its middle, a branch hangs
     * off a stem to one side, and each join below is fed by both lanes above
     * it — the left lane down its right edge, the right lane down its left,
     * meeting over the card that sits between them.
     */

    /** How far a side stem sits in from the edge of the card it leaves. */
    const IN = 22;

    /* care seeker: demand, then the profile it produces */
    vDown("s1", "s2");
    vDown("s2", "s3");

    const s3 = box("s3");
    const s4 = box("s4");
    const s5 = box("s5");
    const sp1 = box("sp1");

    /*
     * One stem off S3's left carries both of the things a profile becomes.
     * It puts a head into the aid track on the way past and then keeps
     * going, turning once into the connection — so the profile reaches the
     * connection directly, not through the aid track it passes.
     */
    const seekStem = s3.l + IN;
    seg(seekStem, s3.b + G, seekStem, sp1.cy);
    hArrow(s4.cy, seekStem, s4.l - G);
    hArrow(sp1.cy, seekStem, sp1.l - G);
    vArrow(s4.l + IN, s4.b + G, s5.t - G);

    /* care provider: supply, then the products, then the connection */
    vDown("p1", "p2");
    vDown("p2", "p3");

    const p3 = box("p3");
    const p5 = box("p5");
    const pw1 = box("pw1");

    /* one stem down P3's left: a head into each paid product, then on into
       the connection the active provider is the other half of */
    const provStem = p3.l + IN;
    vArrow(provStem, p3.b + G, sp1.t - G);
    fromStem(provStem, "p4");
    fromStem(provStem, "p5");

    /* staffing is what makes a hire possible; the line lands over PW1's
       own label so it reads as belonging to that card */
    vArrow(pw1.l + IN, p5.b + G, pw1.t - G);

    /* care worker: campuses, then advisors, then applicants */
    vDown("w1", "w2");
    vDown("w2", "w3");
    const w3 = box("w3");
    vArrow(w3.l + IN, w3.b + G, pw1.t - G);

    /* each join runs on down between the lanes that fed it */
    vDown("sp1", "sp2");
    vDown("sp2", "o1");
    vDown("pw1", "pw2");
    vDown("pw2", "o2");
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
  }, [draw, nodes, metricsLoading]);

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
          traffic={nodes.traffic}
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
        {controls}
        {/* An outcome of the whole map rather than of one lane, so it sits
            with the scope controls rather than inside the figure. */}
        <div className={styles.topStat}>
          <span className={styles.lab}>Revenue generated</span>
          {/* Stated, not queried. Nothing has been collected yet, and a dash
              here would read as "we do not know" rather than "none". */}
          <span className={styles.v}>$0</span>
        </div>
      </div>

      <div className={styles.fit} ref={fitRef}>
        <div className={styles.stage} ref={stageRef}>
          <section className={styles.system} ref={rootRef}>
          <svg className={styles.wires} ref={svgRef} role="presentation" />

          <div className={styles.lanes3} style={{ marginBottom: 8 }}>
            <div className={styles.lab}>Care seeker</div>
            <div className={styles.lab}>Care provider</div>
            <div className={styles.lab}>Care worker</div>
          </div>

          {/*
            Three lanes, each running top to bottom from demand or supply
            down to the milestone it produces. What two lanes produce
            together lives below them, between them.
          */}
          <div className={styles.lanes3}>

            {/* care seeker */}
            <div className={styles.lane}>
                <Card
                  id="s1"
                  code="S1"
                  label="Families engaged"
                  parts="connect requests · benefits assessments"
                  metric={nodes.s1}
                  trend={trends.s1}
                  loading={metricsLoading}
                  onTip={openTip}
                  onTipClose={closeTip}
                  onInspect={onInspect}
                />
              <div className={styles.gap} />
                <Card
                  id="s2"
                  code="S2"
                  label="Families in outreach"
                  metric={nodes.s2}
                  trend={trends.s2}
                  loading={metricsLoading}
                  onTip={openTip}
                  onTipClose={closeTip}
                  onInspect={onInspect}
                />
              <div className={styles.gap} />
                <Card
                  hi
                  id="s3"
                  code="S3"
                  label="Care seeker profiles"
                  metric={nodes.s3}
                  trend={trends.s3}
                  loading={metricsLoading}
                  onTip={openTip}
                  onTipClose={closeTip}
                  onInspect={onInspect}
                />

              {/* the aid track hangs off the profile, indented to say so */}
              <div className={styles.branch}>
                  <Card
                    id="s4"
                    code="S4"
                    label="Aid applied"
                    metric={nodes.s4}
                    trend={trends.s4}
                    loading={metricsLoading}
                    onTip={openTip}
                    onTipClose={closeTip}
                    onInspect={onInspect}
                  />
                <div className={styles.gapSm} />
                  <Card
                    id="s5"
                    code="S5"
                    label="Aid confirmed"
                    metric={nodes.s5}
                    trend={trends.s5}
                    loading={metricsLoading}
                    onTip={openTip}
                    onTipClose={closeTip}
                    onInspect={onInspect}
                  />
              </div>
            </div>

            {/* care provider */}
            <div className={styles.lane}>
                <Card
                  id="p1"
                  code="P1"
                  label="Unclaimed providers"
                  metric={nodes.p1}
                  trend={trends.p1}
                  loading={metricsLoading}
                  onTip={openTip}
                  onTipClose={closeTip}
                  onInspect={onInspect}
                />
              <div className={styles.gap} />
                <Card
                  id="p2"
                  code="P2"
                  label="Providers in outreach"
                  metric={nodes.p2}
                  trend={trends.p2}
                  loading={metricsLoading}
                  onTip={openTip}
                  onTipClose={closeTip}
                  onInspect={onInspect}
                />
              <div className={styles.gap} />
                <Card
                  hi
                  id="p3"
                  code="P3"
                  label="Active providers"
                  metric={nodes.p3}
                  trend={trends.p3}
                  loading={metricsLoading}
                  onTip={openTip}
                  onTipClose={closeTip}
                  onInspect={onInspect}
                />

              {/* the two paid products hang off the active provider */}
              <div className={styles.branchR}>
                  <Card
                    hi
                    id="p4"
                    code="P4"
                    label="Managed ads"
                    money="Paid product"
                    metric={nodes.p4}
                    trend={trends.p4}
                    loading={metricsLoading}
                    onTip={openTip}
                    onTipClose={closeTip}
                    onInspect={onInspect}
                  />
                <div className={styles.gap} />
                  <Card
                    hi
                    id="p5"
                    code="P5"
                    label="Provider staffing signups"
                    money="Paid product"
                    metric={nodes.p5}
                    trend={trends.p5}
                    loading={metricsLoading}
                    onTip={openTip}
                    onTipClose={closeTip}
                    onInspect={onInspect}
                  />
              </div>
            </div>

            {/* care worker */}
            <div className={styles.lane}>
                <Card
                  id="w1"
                  code="W1"
                  label="Universities targeted"
                  metric={nodes.w1}
                  trend={trends.w1}
                  loading={metricsLoading}
                  onTip={openTip}
                  onTipClose={closeTip}
                  onInspect={onInspect}
                />
              <div className={styles.gap} />
                <Card
                  id="w2"
                  code="W2"
                  label="Advisors in outreach"
                  metric={nodes.w2}
                  trend={trends.w2}
                  loading={metricsLoading}
                  onTip={openTip}
                  onTipClose={closeTip}
                  onInspect={onInspect}
                />
              <div className={styles.gap} />
                <Card
                  hi
                  id="w3"
                  code="W3"
                  label="Care worker profiles"
                  parts="channels · started · complete"
                  metric={nodes.w3}
                  trend={trends.w3}
                  loading={metricsLoading}
                  onTip={openTip}
                  onTipClose={closeTip}
                  onInspect={onInspect}
                />
            </div>

          </div>

          {/*
            What two lanes make together. The connection sits between the
            seeker and the provider, the hire between the provider and the
            worker — each centred on the gutter of the two lanes feeding it.
          */}
          <div className={styles.lanesJoin}>

            <div className={`${styles.lane} ${styles.join12}`}>
                <Card
                  id="sp1"
                  code="SP1"
                  label="Family–provider connected"
                  metric={nodes.sp1}
                  trend={trends.sp1}
                  loading={metricsLoading}
                  onTip={openTip}
                  onTipClose={closeTip}
                  onInspect={onInspect}
                />
              <div className={styles.gap} />
                <Card
                  id="sp2"
                  code="SP2"
                  label="Care confirmed"
                  metric={nodes.sp2}
                  trend={trends.sp2}
                  loading={metricsLoading}
                  onTip={openTip}
                  onTipClose={closeTip}
                  onInspect={onInspect}
                />
              <div className={styles.gap} />
                <Card
                  hi
                  id="o1"
                  code="O1"
                  label="Est. healthcare utilization reduction"
                  money="Value created"
                  metric={nodes.o1}
                  trend={trends.o1}
                  loading={metricsLoading}
                  onTip={openTip}
                  onTipClose={closeTip}
                  onInspect={onInspect}
                />
            </div>

            <div className={`${styles.lane} ${styles.join23}`}>
                <Card
                  id="pw1"
                  code="PW1"
                  label="Provider–care worker connected"
                  metric={nodes.pw1}
                  trend={trends.pw1}
                  loading={metricsLoading}
                  onTip={openTip}
                  onTipClose={closeTip}
                  onInspect={onInspect}
                />
              <div className={styles.gap} />
                <Card
                  id="pw2"
                  code="PW2"
                  label="Hires confirmed"
                  metric={nodes.pw2}
                  trend={trends.pw2}
                  loading={metricsLoading}
                  onTip={openTip}
                  onTipClose={closeTip}
                  onInspect={onInspect}
                />
              <div className={styles.gap} />
                <Card
                  hi
                  id="o2"
                  code="O2"
                  label="Est. new care workers"
                  money="Value created"
                  metric={nodes.o2}
                  trend={trends.o2}
                  loading={metricsLoading}
                  onTip={openTip}
                  onTipClose={closeTip}
                  onInspect={onInspect}
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
          />
        </span>
      </div>
      {parts && (
        <div className={styles.n}>
          <Surfaces metric={metric} fallback={parts} />
        </div>
      )}
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
 * A node's breakdown line. Renders the real parts once the node is
 * instrumented and the caller's placeholder until then, so wiring a metric
 * fills in numbers rather than adding a row of its own.
 */
function Surfaces({
  metric,
  fallback,
}: {
  metric?: MetricNode;
  /** Shown before the node is instrumented. */
  fallback?: string;
}) {
  const parts = metric?.breakdown;
  if (!parts?.length) return <span className={styles.dim}>{fallback}</span>;
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
}: {
  metric?: MetricNode;
  trend?: NodeTrend;
  loading?: boolean;
  nodeKey?: string;
  onInspect?: (nodeKey: string) => void;
  onTip?: TipOpener;
  onTipClose?: () => void;
}) {
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
  "s2", "s3", "s4",
  "p1", "p2", "p3", "p4", "p5",
  "w1", "w2", "w3",
  "sp1", "pw1", "pw2",
]);



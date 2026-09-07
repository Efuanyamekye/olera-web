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
  /** Named parts summing to `value`, printed under the node's label. */
  breakdown?: { label: string; value: number }[];
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

/**
 * What actually reached a provider, printed on the arrows into outreach.
 *
 * Separate from the CR6 counts on purpose. An ask is not a delivery: the
 * chip says how many people asked, the arrow says how many notifications
 * left for a provider's inbox, and the gap between them is the thing worth
 * seeing.
 */
export interface Flows {
  questionsToProviders: number | null;
  connectionsToProviders: number | null;
}

/** The class that paints a value its trend colour. Flat keeps ordinary ink. */
function toneClass(score: number): string | null {
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
  cr2:
    "Unique people who arrived from a search engine, from Olera's own page events. Compare with GA4 Organic Search users, not sessions.",
  cr4:
    "Page views across the three surfaces we publish, from all traffic sources. Counts views, not people, so it runs higher than CR2.",
  cr6:
    "Every care recipient action that asks us for something: the three CTA types below, added together. Scoped by the city the ask is about.",
  cr6a:
    "Questions submitted to providers through Q&A. Same source as the Overview's Questions Asked card. The number on the arrow is how many reached a provider's inbox.",
  cr6b:
    "Requests to be connected to a provider, however they started. The number on the arrow is how many reached a provider's inbox.",
  cr6c:
    "Benefits screeners completed to the end, where results are saved. No provider is involved, so the city here is the care recipient's own.",
  cp1:
    "Every provider in the directory that has not been deleted, split by whether anyone has claimed them. Scoped by the provider's city. A standing count — the date range does not change it.",
  cp2:
    "Unclaimed providers who heard from us in this range — any email, call or MedJobs contact. Counts providers, not messages, so twenty emails to one provider is one.",
  m1:
    "Care recipient profiles with a published care post — the state that makes someone visible to providers. Publishing is not timestamped, so this counts profiles created in this range that are live today.",
  m2:
    "Providers who finished claiming their listing in this range. An event, unlike CP1's claimed total, which is a standing count.",
  m3: "Providers who requested a managed ad campaign in this range.",
  m4: "Providers who activated MedJobs staffing in this range.",
  m5:
    "MedJobs applications begun, and how many are finished — a profile goes live once the intro video and documents are in. The gap is the pool still to convert.",
  cw1:
    "Universities we have listed and are working, scoped by the university's city. A standing count — the date range does not change it.",
  cw2:
    "Advisors we can reach at those universities, counted where the contact record is still active. A standing count.",
  flow_questions:
    "Question notifications successfully sent to providers in this range. Not a subset of CR6a — a backlog flush sends for questions asked earlier, so this can run higher.",
  flow_connections:
    "Connection requests successfully sent to providers in this range. Not a subset of CR6b — a send can happen later than the ask, so this can run higher.",
  ta1:
    "Families who told us they are moving forward with a benefit. Applying happens on a government site, so this is their own report — a floor, not a count.",
  tb1:
    "Inquiries that reached Connected, by the same rule the Connections page uses: a provider reply, a confirmation from either side, or an admin marking it.",
  tc1: "Interviews that reached confirmed. Whether the interview was held is not recorded.",
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
  flows,
  metricsLoading,
  onInspect,
  showNumbers = true,
}: {
  /** Slug of the city the map is scoped to, or null for all cities. */
  selectedCity: string | null;
  onSelectCity: (slug: string | null) => void;
  /** Instrumented node values, keyed by node id. Missing = not instrumented. */
  nodes: MetricNodes;
  /** Direction per node. Arrives after the values; missing = uncoloured. */
  trends: NodeTrends;
  /** Counts printed on the two arrows into provider outreach. */
  flows: Flows | null;
  metricsLoading: boolean;
  /** Open the receipts for a node. Omitted when inspection is unavailable. */
  onInspect?: (nodeKey: string) => void;
  /** False strips every value, dash and marker, leaving the structure. */
  showNumbers?: boolean;
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
    /** Feed a card's output into a vertical stem to its right. */
    const toStem = (
      a: string,
      x: number,
      flow: { count: number; node: string } | null = null,
    ) => {
      const A = box(a);
      hArrow(A.cy, A.r + G, x - 1);
      if (!flow) return;
      // Sits on the line rather than beside it, so it reads as a property of
      // the flow and not as another node floating in the gap. Clickable for
      // the same reason the card values are: a number you cannot check is a
      // number you have to take on faith.
      const t = document.createElementNS(SVG_NS, "text");
      t.setAttribute("x", String((A.r + G + x) / 2));
      t.setAttribute("y", String(A.cy - 5));
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("class", styles.wireLabel);
      t.textContent = flow.count.toLocaleString();
      t.setAttribute("role", "button");
      t.setAttribute("tabindex", "0");
      t.setAttribute("aria-label", `${flow.count} — show where this number comes from`);
      const open = () => inspectRef.current?.(flow.node);
      t.addEventListener("click", open);
      // Same contract as every card value: hover explains it, click opens
      // the rows behind it.
      const tip = () =>
        tipRef.current?.open(
          t as unknown as HTMLElement,
          flow.node,
          null,
          tipRef.current.trends[flow.node] ?? null,
        );
      t.addEventListener("mouseenter", tip);
      t.addEventListener("focus", tip);
      t.addEventListener("mouseleave", () => tipRef.current?.close());
      t.addEventListener("blur", () => tipRef.current?.close());
      t.addEventListener("keydown", (e) => {
        const key = (e as KeyboardEvent).key;
        if (key === "Enter" || key === " ") {
          e.preventDefault();
          open();
        }
      });
      svg!.appendChild(t);
    };

    /** The line every top-section drop terminates on. */
    const BT = box("bottom").t - G;

    const cr1 = box("cr1");
    const cr2 = box("cr2");
    const cr3 = box("cr3");
    const cr4 = box("cr4");
    const cr6 = box("cr6");

    /* care recipient sources converge on CR4, head riding the CR2 line */
    const bar0 = cr3.b + 18;
    [cr1, cr2, cr3].forEach((s) => seg(s.cx, s.b + G, s.cx, bar0));
    seg(cr1.cx, bar0, cr3.cx, bar0);
    vArrow(cr2.cx, bar0, cr4.t - G);

    /* referrals also run straight past the funnel */
    vArrow(cr1.l + 14, cr1.b + G, BT);

    const stem1 = cr4.l + 14;
    seg(stem1, cr4.b + G, stem1, cr6.t - 8);
    head(stem1, cr6.t - G, "d");

    const stem2 = cr6.l + 14;
    seg(stem2, cr6.b + G, stem2, BT - 8);
    head(stem2, BT, "d");
    ["cr6a", "cr6b", "cr6c"].forEach((id) => fromStem(stem2, id));

    /* care provider */
    vDown("cp1", "cp2");
    const cp2 = box("cp2");
    seg(cp2.cx, cp2.b + G, cp2.cx, BT - 8);
    head(cp2.cx, BT, "d");
    // Benefits assessments never reach a provider, so only the two asks that
    // do run across. Each carries what actually left for a provider's inbox.
    const sent = flowsRef.current;
    toStem(
      "cr6a",
      cp2.cx,
      typeof sent?.questionsToProviders === "number"
        ? { count: sent.questionsToProviders, node: "flow_questions" }
        : null,
    );
    toStem(
      "cr6b",
      cp2.cx,
      typeof sent?.connectionsToProviders === "number"
        ? { count: sent.connectionsToProviders, node: "flow_connections" }
        : null,
    );

    /* care worker runs straight down its lane and into the milestone layer */
    vDown("cw1", "cw2");
    vDown("cw2", "cw3");
    const cw3 = box("cw3");
    vArrow(cw3.cx, cw3.b + G, BT);

    /* inside the tracks */
    vDown("ta1", "ta2");
    vDown("tb1", "tb2");
    vDown("tc1", "tc2");

    /* aid and care established converge on the spending outcome */
    const ta2 = box("ta2");
    const tb2 = box("tb2");
    const o1 = box("o1");
    const outBar = Math.max(ta2.b, tb2.b) + 24;
    seg(ta2.cx, ta2.b + G, ta2.cx, outBar);
    seg(tb2.cx, tb2.b + G, tb2.cx, outBar);
    seg(ta2.cx, outBar, tb2.cx, outBar);
    vArrow(o1.cx, outBar, o1.t - G);
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
    // Values change card heights, which every arrow is measured from. The
    // flow labels change nothing about layout, so nothing else would notice
    // them arriving — hence their own trigger here.
    draw();
  }, [draw, nodes, flows, metricsLoading, showNumbers]);

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
  const flowsRef = useRef<Flows | null>(null);
  flowsRef.current = showNumbers ? flows : null;
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
          trend={tip.trend}
          tone={tip.trend ? toneClass(tip.trend.score) : null}
          inspectable={INSPECTABLE.has(tip.nodeKey) || tip.nodeKey.startsWith("flow_")}
          x={tip.x}
          y={tip.y}
          onEnter={cancelClose}
          onLeave={closeTip}
        />
      )}
      <div className={styles.fit} ref={fitRef}>
        <div className={styles.stage} ref={stageRef}>
          <section className={styles.system} ref={rootRef}>
          <svg className={styles.wires} ref={svgRef} role="presentation" />

          <div className={styles.full} ref={pickerRef} style={{ position: "relative" }}>
            <button
              type="button"
              className={`${styles.pill} ${styles.pillButton}`}
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
                <span className={styles.pillCount}>
                  {cities.status === "ready"
                    ? `${cities.truncated ? "≥" : ""}${cities.cities.length.toLocaleString()}`
                    : cities.status === "loading"
                      ? "…"
                      : NOT_INSTRUMENTED}
                </span>
              )}
              {active && (
                <span className={styles.pillCount}>
                  {active.providers.toLocaleString()} providers
                </span>
              )}
              <span className={styles.pillCaret}>▼</span>
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
          <div style={{ height: 14 }} />

          <div className={styles.lanes3} style={{ marginBottom: 8 }}>
            <div className={styles.lab}>Care recipient</div>
            <div className={styles.lab}>Care provider</div>
            <div className={styles.lab}>Care worker</div>
          </div>

          {/* ---------------- top ---------------- */}
          <div className={styles.lanes3}>
            {/* care recipient */}
            <div className={styles.lane}>
              <div className={styles.chips}>
                <Chip id="cr1" code="CR1" label="Referrals" />
                <Chip
                  id="cr2"
                  code="CR2"
                  label="Organic visitors"
                  metric={nodes.cr2}
                  trend={trends.cr2}
                  loading={metricsLoading}
                  onTip={openTip}
                  onTipClose={closeTip}
                  onInspect={onInspect}
                  showNumbers={showNumbers}
                />
                <Chip id="cr3" code="CR3" label="Paid ad visitors" />
              </div>
              <div className={styles.indent} style={{ marginTop: 22 }}>
                <Card
                  id="cr4"
                  code="CR4"
                  metric={nodes.cr4}
                  trend={trends.cr4}
                  loading={metricsLoading}
                  onTip={openTip}
                  onTipClose={closeTip}
                  label={
                    <>
                      Page visits
                      {showNumbers && <br />}
                      <Surfaces metric={nodes.cr4} showNumbers={showNumbers} />
                    </>
                  }
                />
                <div style={{ marginTop: 16 }}>
                  <Card
                    id="cr6"
                    code="CR6"
                    label="CTAs completed"
                    metric={nodes.cr6}
                    trend={trends.cr6}
                    loading={metricsLoading}
                    onTip={openTip}
                    onTipClose={closeTip}
                    onInspect={onInspect}
                  showNumbers={showNumbers}
                  />
                </div>
                <div className={styles.offshoots} style={{ marginTop: 14 }}>
                  <Chip
                    id="cr6a"
                    code="CR6a"
                    label="Questions"
                    metric={nodes.cr6a}
                    trend={trends.cr6a}
                    loading={metricsLoading}
                    onTip={openTip}
                    onTipClose={closeTip}
                    onInspect={onInspect}
                  showNumbers={showNumbers}
                  />
                  <Chip
                    id="cr6b"
                    code="CR6b"
                    label="Connections"
                    metric={nodes.cr6b}
                    trend={trends.cr6b}
                    loading={metricsLoading}
                    onTip={openTip}
                    onTipClose={closeTip}
                    onInspect={onInspect}
                  showNumbers={showNumbers}
                  />
                  <Chip
                    id="cr6c"
                    code="CR6c"
                    label="Benefits Assessment"
                    metric={nodes.cr6c}
                    trend={trends.cr6c}
                    loading={metricsLoading}
                    onTip={openTip}
                    onTipClose={closeTip}
                    onInspect={onInspect}
                  showNumbers={showNumbers}
                  />
                </div>
                <div style={{ height: 14 }} />
              </div>
            </div>

            {/* care provider */}
            <div className={styles.lane}>
              <div className={`${styles.chips} ${styles.solo}`}>
                <Card
                  id="cp1"
                  code="CP1"
                  label={
                    <>
                      Providers listed
                      {showNumbers && <br />}
                      <Surfaces
                        metric={nodes.cp1}
                        fallback="claimed · unclaimed"
                        showNumbers={showNumbers}
                      />
                    </>
                  }
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
                  label="In outreach"
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
                label="Universities listed"
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
                label="Advisors listed"
                metric={nodes.cw2}
                trend={trends.cw2}
                loading={metricsLoading}
                onTip={openTip}
                onTipClose={closeTip}
                onInspect={onInspect}
                  showNumbers={showNumbers}
              />
              <div className={styles.gap} />
              <Card id="cw3" code="CW3" label="University channels activated" />
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
                  label="Care recipient profiles live"
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
                  label="Provider profiles claimed"
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
                  label="Managed ad signups"
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
                  label={
                    <>
                      Care worker profiles
                      {showNumbers && <br />}
                      <Surfaces
                        metric={nodes.m5}
                        fallback="started · complete"
                        showNumbers={showNumbers}
                      />
                    </>
                  }
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
                  <Card id="ta2" code="TA2" label="Aid established" />
                </div>
              </div>

              <div className={styles.col} id={nodeId("tb")}>
                <span className={styles.lab}>TB care establishment</span>
                <div className={styles.stack}>
                  <Card
                    id="tb1"
                    code="TB1"
                    label="Connection confirmed"
                    metric={nodes.tb1}
                    trend={trends.tb1}
                    loading={metricsLoading}
                    onTip={openTip}
                    onTipClose={closeTip}
                    onInspect={onInspect}
                    showNumbers={showNumbers}
                  />
                  <Card id="tb2" code="TB2" label="Care established" />
                </div>
              </div>

              <div className={styles.col} id={nodeId("tc")}>
                <span className={styles.lab}>TC care worker hiring</span>
                <div className={styles.stack}>
                  <Card
                    id="tc1"
                    code="TC1"
                    label="Interviews confirmed"
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
              <div className={styles.stat}>
                <span className={styles.lab}>Revenue generated</span>
                {showNumbers && <span className={styles.v}>{NOT_INSTRUMENTED}</span>}
              </div>
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
  label: ReactNode;
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
      <div className={styles.n}>{label}</div>
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
      {label}
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
 * The three surfaces CR4 spans. This line already named them; instrumenting
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
          {p.label} <b className={styles.surfaceValue}>{p.value.toLocaleString()}</b>
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
  "cr2", "cr4", "cr6a", "cr6b", "cr6c",
  "cp1", "cp2",
  "m1", "m2", "m3", "m4", "m5",
  "cw1", "cw2",
  "ta1", "tb1", "tc1", "tc2",
]);



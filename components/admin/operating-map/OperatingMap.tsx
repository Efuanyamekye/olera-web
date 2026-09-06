"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import styles from "./OperatingMap.module.css";

/**
 * The Olera operating map — every step of the marketplace, in one figure.
 *
 * Nothing here is instrumented yet. Each node renders a placeholder value so
 * that wiring a metric later is a one-line change at the node, not a layout
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
  cr5:
    "Questions submitted to providers through Q&A. Same source as the Overview's Questions Asked card, so the two always agree.",
  cr6:
    "Every care recipient action that asks us for something: the three CTA types below, added together.",
  cr6a: "Benefits screeners completed to the end, where results are saved.",
  cr6b: "Requests to be connected to a provider, however they started.",
  cr6c: "Care posts published, making a care recipient visible to providers.",
  cp1:
    "Every provider in the directory that has not been deleted, split by whether anyone has claimed them. Scoped by the provider's city. A standing count — the date range does not change it.",
  cp2:
    "Unclaimed providers who heard from us in this range — any email, call or MedJobs contact. Counts providers, not messages, so twenty emails to one provider is one.",
  m1:
    "Care recipient profiles that are complete. Completion is not timestamped, so this counts profiles created in this range that are complete today.",
  m2:
    "Care worker profiles that are complete — a MedJobs application goes live once the intro video is in. Same timing caveat as M1.",
  m3:
    "Providers who finished claiming their listing in this range. An event, unlike CP1's claimed total, which is a standing count.",
  m4: "Providers who requested a managed ad campaign in this range.",
  m5: "Providers who activated MedJobs staffing in this range.",
  cw1:
    "Universities we have listed and are working, scoped by the university's city. A standing count — the date range does not change it.",
  cw2:
    "Advisors we can reach at those universities, counted where the contact record is still active. A standing count.",
  tb1: "Inquiries raised between a care recipient and a provider in this range.",
  tb2: "Of those inquiries, the ones a provider answered.",
  tc1: "Interviews proposed between a care worker and a provider in this range.",
  tc2: "Of those interviews, the ones that reached confirmed. Whether the interview was held is not recorded.",
  tc3: "Placements the care worker accepted.",
};

/** Tooltip anchored to a node, positioned outside the scaled figure. */
interface Tip {
  text: string;
  caveat?: string | null;
  x: number;
  y: number;
}

export default function OperatingMap({
  selectedCity,
  onSelectCity,
  nodes,
  metricsLoading,
  onInspect,
  showNumbers = true,
}: {
  /** Slug of the city the map is scoped to, or null for all cities. */
  selectedCity: string | null;
  onSelectCity: (slug: string | null) => void;
  /** Instrumented node values, keyed by node id. Missing = not instrumented. */
  nodes: MetricNodes;
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

    /** Horizontal arrow that can point either way. */
    function hTo(y: number, x1: number, x2: number) {
      const s2 = x2 > x1 ? 1 : -1;
      seg(x1, y, x2 - 8 * s2, y);
      const p = document.createElementNS(SVG_NS, "polygon");
      p.setAttribute(
        "points",
        [`${x2},${y}`, `${x2 - 8 * s2},${y - 4.4}`, `${x2 - 8 * s2},${y + 4.4}`].join(" "),
      );
      svg!.appendChild(p);
    }

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
    const toStem = (a: string, x: number) => {
      const A = box(a);
      hArrow(A.cy, A.r + G, x - 1);
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
    fromStem(stem1, "cr5");

    const stem2 = cr6.l + 14;
    seg(stem2, cr6.b + G, stem2, BT - 8);
    head(stem2, BT, "d");
    ["cr6a", "cr6b", "cr6c"].forEach((id) => fromStem(stem2, id));

    /* care provider */
    vDown("cp1", "cp2");
    const cp2 = box("cp2");
    seg(cp2.cx, cp2.b + G, cp2.cx, BT - 8);
    head(cp2.cx, BT, "d");
    ["cr5", "cr6b", "cr6c"].forEach((id) => toStem(id, cp2.cx));

    /* care worker runs straight down its lane and into the milestone layer */
    vDown("cw1", "cw2");
    vDown("cw2", "cw3");
    const cw3 = box("cw3");
    vArrow(cw3.cx, cw3.b + G, BT);

    /* care worker and care recipient profiles feed provider outreach */
    const m2 = box("m2");
    const joinY = BT - 26;
    seg(m2.cx, m2.t - G, m2.cx, joinY);
    hTo(joinY, m2.cx, cp2.cx);

    const m1 = box("m1");
    const joinY1 = BT - 48;
    // Start the riser clear of the CR6 stem so the two never cross.
    const m1x = Math.max(m1.cx, stem2 + 26);
    seg(m1x, m1.t - G, m1x, joinY1);
    hTo(joinY1, m1x, cp2.cx);

    /* inside the tracks */
    vDown("ta1", "ta2");
    vDown("ta2", "ta3");
    vDown("ta3", "ta4");
    vDown("tb1", "tb2");
    vDown("tb2", "tb3");
    vDown("tb3", "tb4");
    vDown("tc1", "tc2");
    vDown("tc2", "tc3");
    vDown("tc3", "tc4");

    /* aid delivered and care delivered converge on the spending outcome */
    const ta4 = box("ta4");
    const tb4 = box("tb4");
    const o1 = box("o1");
    const outBar = Math.max(ta4.b, tb4.b) + 24;
    seg(ta4.cx, ta4.b + G, ta4.cx, outBar);
    seg(tb4.cx, tb4.b + G, tb4.cx, outBar);
    seg(ta4.cx, outBar, tb4.cx, outBar);
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
  const openTip = useCallback((el: HTMLElement, key: string, caveat?: string | null) => {
    const text = NODE_HELP[key];
    if (!text) return;
    const root = rootWrapRef.current;
    if (!root) return;
    const r = el.getBoundingClientRect();
    const c = root.getBoundingClientRect();
    const TIP_WIDTH = 320;
    // Keep it inside the wrapper rather than letting it hang off the edge.
    const x = Math.min(Math.max(r.left - c.left - 8, 8), Math.max(c.width - TIP_WIDTH - 8, 8));
    setTip({ text, caveat, x, y: r.bottom - c.top + 8 });
  }, []);

  return (
    <div className={styles.root} ref={rootWrapRef} style={{ position: "relative" }}>
      {tip && (
        <div className={styles.tip} style={{ left: tip.x, top: tip.y }} role="tooltip">
          {tip.text}
          {tip.caveat && <span className={styles.tipCaveat}>{tip.caveat}</span>}
        </div>
      )}
      <div className={styles.fit} ref={fitRef}>
        <div className={styles.stage} ref={stageRef}>
          <section className={styles.system} ref={rootRef}>
          <svg className={styles.wires} ref={svgRef} aria-hidden="true" />

          <div className={styles.full} ref={pickerRef} style={{ position: "relative" }}>
            <button
              type="button"
              className={`${styles.pill} ${styles.pillButton}`}
              onClick={() => setPickerOpen((v) => !v)}
              aria-expanded={pickerOpen}
              aria-haspopup="listbox"
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
            <button
              type="button"
              className={styles.info}
              aria-label="About this number"
              style={{ position: "absolute", right: 10, top: 12 }}
              onMouseEnter={(e) => openTip(e.currentTarget, "cities")}
              onMouseLeave={() => setTip(null)}
              onFocus={(e) => openTip(e.currentTarget, "cities")}
              onBlur={() => setTip(null)}
            >
              ⓘ
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
                  loading={metricsLoading}
                  onTip={openTip}
                  onTipClose={() => setTip(null)}
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
                  loading={metricsLoading}
                  onTip={openTip}
                  onTipClose={() => setTip(null)}
                  label={
                    <>
                      Page visits
                      <br />
                      <Surfaces metric={nodes.cr4} />
                    </>
                  }
                />
                <div className={styles.offshoot} style={{ marginTop: 16 }}>
                  <Chip
                    id="cr5"
                    code="CR5"
                    label="Questions asked"
                    metric={nodes.cr5}
                    loading={metricsLoading}
                    onTip={openTip}
                    onTipClose={() => setTip(null)}
                    onInspect={onInspect}
                  showNumbers={showNumbers}
                  />
                </div>
                <div style={{ marginTop: 16 }}>
                  <Card
                    id="cr6"
                    code="CR6"
                    label="CTAs submitted"
                    metric={nodes.cr6}
                    loading={metricsLoading}
                    onTip={openTip}
                    onTipClose={() => setTip(null)}
                    onInspect={onInspect}
                  showNumbers={showNumbers}
                  />
                </div>
                <div className={styles.offshoots} style={{ marginTop: 14 }}>
                  <Chip
                    id="cr6a"
                    code="CR6a"
                    label="Benefits CTAs"
                    metric={nodes.cr6a}
                    loading={metricsLoading}
                    onTip={openTip}
                    onTipClose={() => setTip(null)}
                    onInspect={onInspect}
                  showNumbers={showNumbers}
                  />
                  <Chip
                    id="cr6b"
                    code="CR6b"
                    label="Connection CTAs"
                    metric={nodes.cr6b}
                    loading={metricsLoading}
                    onTip={openTip}
                    onTipClose={() => setTip(null)}
                    onInspect={onInspect}
                  showNumbers={showNumbers}
                  />
                  <Chip
                    id="cr6c"
                    code="CR6c"
                    label="Profiles made live"
                    metric={nodes.cr6c}
                    loading={metricsLoading}
                    onTip={openTip}
                    onTipClose={() => setTip(null)}
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
                      <br />
                      <Surfaces metric={nodes.cp1} fallback="claimed · unclaimed" />
                    </>
                  }
                  metric={nodes.cp1}
                  loading={metricsLoading}
                  onTip={openTip}
                  onTipClose={() => setTip(null)}
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
                  loading={metricsLoading}
                  onTip={openTip}
                  onTipClose={() => setTip(null)}
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
                loading={metricsLoading}
                onTip={openTip}
                onTipClose={() => setTip(null)}
                onInspect={onInspect}
                  showNumbers={showNumbers}
              />
              <div className={styles.gap} />
              <Card
                id="cw2"
                code="CW2"
                label="Advisors listed"
                metric={nodes.cw2}
                loading={metricsLoading}
                onTip={openTip}
                onTipClose={() => setTip(null)}
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
                  label="Care recipient profiles completed"
                  metric={nodes.m1}
                  loading={metricsLoading}
                  onTip={openTip}
                  onTipClose={() => setTip(null)}
                  onInspect={onInspect}
                  showNumbers={showNumbers}
                />
                <Card
                  hi
                  id="m2"
                  code="M2"
                  label="Care worker profiles completed"
                  metric={nodes.m2}
                  loading={metricsLoading}
                  onTip={openTip}
                  onTipClose={() => setTip(null)}
                  onInspect={onInspect}
                  showNumbers={showNumbers}
                />
                <Card
                  hi
                  id="m3"
                  code="M3"
                  label="Provider profiles claimed"
                  metric={nodes.m3}
                  loading={metricsLoading}
                  onTip={openTip}
                  onTipClose={() => setTip(null)}
                  onInspect={onInspect}
                  showNumbers={showNumbers}
                />
                <Card
                  hi
                  id="m4"
                  code="M4" money="Paid product"
                  label="Managed ad signups"
                  metric={nodes.m4}
                  loading={metricsLoading}
                  onTip={openTip}
                  onTipClose={() => setTip(null)}
                  onInspect={onInspect}
                  showNumbers={showNumbers}
                />
                <Card
                  hi
                  id="m5"
                  code="M5"
                  label="Provider staffing signups"
                  metric={nodes.m5}
                  loading={metricsLoading}
                  onTip={openTip}
                  onTipClose={() => setTip(null)}
                  onInspect={onInspect}
                  showNumbers={showNumbers}
                />
              </div>
            </div>

            <div className={styles.tracks}>
              <div className={styles.col} id={nodeId("ta")}>
                <span className={styles.lab}>TA aid establishment</span>
                <div className={styles.stack}>
                  <Card id="ta1" code="TA1" label="Matched" />
                  <Card id="ta2" code="TA2" label="Applied" />
                  <Card id="ta3" code="TA3" label="Aid established" />
                  <Card id="ta4" code="TA4" label="Aid delivered" />
                </div>
              </div>

              <div className={styles.col} id={nodeId("tb")}>
                <span className={styles.lab}>TB care establishment</span>
                <div className={styles.stack}>
                  <Card
                    id="tb1"
                    code="TB1"
                    label="Care recipient–provider matched"
                    metric={nodes.tb1}
                    loading={metricsLoading}
                    onTip={openTip}
                    onTipClose={() => setTip(null)}
                    onInspect={onInspect}
                    showNumbers={showNumbers}
                  />
                  <Card
                    id="tb2"
                    code="TB2"
                    label="Connection confirmed"
                    metric={nodes.tb2}
                    loading={metricsLoading}
                    onTip={openTip}
                    onTipClose={() => setTip(null)}
                    onInspect={onInspect}
                    showNumbers={showNumbers}
                  />
                  <Card id="tb3" code="TB3" label="Care established" />
                  <Card id="tb4" code="TB4" label="Care delivered" />
                </div>
              </div>

              <div className={styles.col} id={nodeId("tc")}>
                <span className={styles.lab}>TC care worker hiring</span>
                <div className={styles.stack}>
                  <Card
                    id="tc1"
                    code="TC1"
                    label="Care worker–provider matched"
                    metric={nodes.tc1}
                    loading={metricsLoading}
                    onTip={openTip}
                    onTipClose={() => setTip(null)}
                    onInspect={onInspect}
                    showNumbers={showNumbers}
                  />
                  <Card
                    id="tc2"
                    code="TC2"
                    label="Interviews confirmed"
                    metric={nodes.tc2}
                    loading={metricsLoading}
                    onTip={openTip}
                    onTipClose={() => setTip(null)}
                    onInspect={onInspect}
                    showNumbers={showNumbers}
                  />
                  <Card
                    id="tc3"
                    code="TC3"
                    label="Hires confirmed"
                    metric={nodes.tc3}
                    loading={metricsLoading}
                    onTip={openTip}
                    onTipClose={() => setTip(null)}
                    onInspect={onInspect}
                    showNumbers={showNumbers}
                  />
                  <Card id="tc4" code="TC4" money="Revenue generating" label="Hours worked" />
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
                <span className={styles.v}>{NOT_INSTRUMENTED}</span>
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
            loading={loading}
            nodeKey={id}
            onInspect={onInspect}
            showNumbers={showNumbers}
          />
          <InfoButton
            nodeKey={id}
            metric={metric}
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
            loading={loading}
            nodeKey={id}
            onInspect={onInspect}
            showNumbers={showNumbers}
          />
          <InfoButton
            nodeKey={id}
            metric={metric}
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

export type TipOpener = (el: HTMLElement, key: string, caveat?: string | null) => void;

/**
 * The three surfaces CR4 spans. This line already named them; instrumenting
 * the node fills in the numbers rather than adding a row of its own.
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

/** Only rendered where there is something to explain. */
function InfoButton({
  nodeKey,
  metric,
  onTip,
  onTipClose,
  showNumbers = true,
}: {
  nodeKey: string;
  metric?: MetricNode;
  onTip?: TipOpener;
  onTipClose?: () => void;
  showNumbers?: boolean;
}) {
  if (!showNumbers || !onTip || !NODE_HELP[nodeKey]) return null;
  return (
    <button
      type="button"
      className={styles.info}
      aria-label="About this number"
      onMouseEnter={(e) => onTip(e.currentTarget, nodeKey, metric?.caveat)}
      onMouseLeave={onTipClose}
      onFocus={(e) => onTip(e.currentTarget, nodeKey, metric?.caveat)}
      onBlur={onTipClose}
    >
      ⓘ
    </button>
  );
}

/** The number, or an honest placeholder. Never a zero standing in for
 *  "we don't know". */
function MetricValue({
  metric,
  loading,
  nodeKey,
  onInspect,
  showNumbers = true,
}: {
  metric?: MetricNode;
  loading?: boolean;
  nodeKey?: string;
  onInspect?: (nodeKey: string) => void;
  showNumbers?: boolean;
}) {
  // With numbers off there is nothing to say here, not even that we do not
  // know — a dash is still reporting.
  if (!showNumbers) return null;
  if (!metric) {
    return <span className={`${styles.value} ${styles.valueMuted}`}>{NOT_INSTRUMENTED}</span>;
  }
  if (loading) return <span className={`${styles.value} ${styles.valueMuted}`}>…</span>;
  if (metric.value === null) {
    return <span className={`${styles.value} ${styles.valueMuted}`}>{NOT_INSTRUMENTED}</span>;
  }
  const text = metric.value.toLocaleString();
  // A number you can open is a number you can check. Nodes without a source
  // descriptor stay plain text rather than offering a dead click.
  if (!onInspect || !nodeKey || !INSPECTABLE.has(nodeKey)) {
    return <span className={styles.value}>{text}</span>;
  }
  return (
    <button
      type="button"
      className={`${styles.value} ${styles.valueButton}`}
      onClick={() => onInspect(nodeKey)}
      title="Show where this number comes from"
    >
      {text}
    </button>
  );
}

/** Nodes the inspect endpoint can produce rows for. */
const INSPECTABLE = new Set([
  "cr2", "cr4", "cr5", "cr6a", "cr6b", "cr6c",
  "cp1", "cp2",
  "m1", "m2", "m3", "m4", "m5",
  "cw1", "cw2",
  "tb1", "tb2", "tc1", "tc2", "tc3",
]);



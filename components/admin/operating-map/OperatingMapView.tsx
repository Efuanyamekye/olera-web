"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import DateRangePopover, {
  resolveRange,
  type DateRangeValue,
} from "@/components/admin/DateRangePopover";
import { useUrlDateRangeState } from "@/hooks/useUrlDateRangeState";
import OperatingMap, {
  type Flows,
  type MetricNodes,
  type NodeTrends,
} from "./OperatingMap";
import NodeInspector from "./NodeInspector";

/**
 * Scope and period for the map, both held in the URL so a view can be linked
 * the way the rest of the admin console links its reporting.
 *
 * The range control lives here rather than inside the figure on purpose: the
 * figure is scaled down to fit the screen, and a control rendered inside it
 * would shrink with everything else.
 */

/**
 * 30 days rather than the console's usual default. Referrer classification
 * shipped 2026-08-12, so a longer window would mostly report the period
 * before organic traffic could be identified at all.
 */
const DEFAULT_RANGE: DateRangeValue = { preset: "30d", customFrom: "", customTo: "" };

export default function OperatingMapView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedCity = searchParams.get("city");
  // Numbers off gives the plain structure — the funnel without the reporting.
  const showNumbers = searchParams.get("numbers") !== "off";

  const [range, setRange] = useUrlDateRangeState(DEFAULT_RANGE);
  const resolved = useMemo(() => resolveRange(range), [range]);

  const [nodes, setNodes] = useState<MetricNodes>({});
  const [trends, setTrends] = useState<NodeTrends>({});
  const [flows, setFlows] = useState<Flows | null>(null);
  const [inspecting, setInspecting] = useState<string | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);

  const toggleNumbers = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    if (showNumbers) next.set("numbers", "off");
    else next.delete("numbers");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams, showNumbers]);

  const onSelectCity = useCallback(
    (slug: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (slug) next.set("city", slug);
      else next.delete("city");
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (resolved.from) params.set("date_from", resolved.from);
    if (resolved.to) params.set("date_to", resolved.to);
    if (selectedCity) params.set("city", selectedCity);

    setMetricsLoading(true);
    fetch(`/api/admin/operating-map/metrics?${params}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("metrics failed"))))
      .then((d) => {
        // The response also carries `checks`. They are deliberately not
        // rendered — the map is for reading numbers, not auditing them. Hit
        // the endpoint directly when you want to audit.
        setNodes((d.nodes ?? {}) as MetricNodes);
        setFlows((d.flows ?? null) as Flows | null);
        setMetricsLoading(false);
      })
      .catch((e: unknown) => {
        if ((e as Error)?.name === "AbortError") return;
        // Every instrumented node renders as unavailable rather than zero.
        setNodes({ cr2: { value: null, caveat: "This metric failed to load." } });
        setFlows(null);
        setMetricsLoading(false);
      });

    return () => controller.abort();
  }, [resolved.from, resolved.to, selectedCity]);

  /*
   * Trends load separately and never block the numbers.
   *
   * They recount every node over four fixed windows, so folding them into
   * the metrics request would make the whole map wait on the slowest of five
   * passes. The map paints, then the colours arrive. They also ignore the
   * date range by design — see trends.server.ts — so this only re-runs when
   * the city changes.
   */
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (selectedCity) params.set("city", selectedCity);

    setTrends({});
    fetch(`/api/admin/operating-map/trends?${params}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("trends failed"))))
      .then((d) => setTrends((d.trends ?? {}) as NodeTrends))
      .catch((e: unknown) => {
        if ((e as Error)?.name === "AbortError") return;
        // No colour is the correct failure. A number in plain ink reads as
        // "no direction shown", which is exactly what happened.
        setTrends({});
      });

    return () => controller.abort();
  }, [selectedCity]);

  // The inspector reads the same window and city the numbers were counted
  // over, so its rows can never describe a different query than the value.
  const inspectParams = useMemo(() => {
    const p = new URLSearchParams();
    if (resolved.from) p.set("date_from", resolved.from);
    if (resolved.to) p.set("date_to", resolved.to);
    if (selectedCity) p.set("city", selectedCity);
    return p.toString();
  }, [resolved.from, resolved.to, selectedCity]);

  return (
    <div>
      <OperatingMap
        selectedCity={selectedCity}
        onSelectCity={onSelectCity}
        nodes={showNumbers ? nodes : {}}
        trends={showNumbers ? trends : {}}
        flows={showNumbers ? flows : null}
        metricsLoading={showNumbers && metricsLoading}
        onInspect={showNumbers ? setInspecting : undefined}
        showNumbers={showNumbers}
        controls={
          <>
            <button
              type="button"
              onClick={toggleNumbers}
              aria-pressed={!showNumbers}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                showNumbers
                  ? "border-gray-200 bg-white text-gray-600 hover:text-gray-900"
                  : "border-gray-900 bg-gray-900 text-white"
              }`}
            >
              {showNumbers ? "Hide numbers" : "Numbers hidden"}
            </button>
            <DateRangePopover value={range} onChange={setRange} />
          </>
        }
      />

      {inspecting && (
        <NodeInspector
          node={inspecting}
          params={inspectParams}
          onClose={() => setInspecting(null)}
        />
      )}
    </div>
  );
}

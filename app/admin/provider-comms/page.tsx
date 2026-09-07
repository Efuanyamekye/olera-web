"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  resolveRange,
  type DateRangeValue,
} from "@/components/admin/DateRangePopover";
import { useUrlDateRangeState } from "@/hooks/useUrlDateRangeState";
import {
  SOURCE_LABELS,
  type Source,
  type ProviderCommsReport,
} from "@/lib/provider-comms/reporting";

import ProviderCommsReportView from "@/components/admin/ProviderCommsReport";

const DEFAULT_RANGE: DateRangeValue = {
  preset: "7d",
  customFrom: "",
  customTo: "",
};
export default function ProviderCommsPage() {
  const [range, setRange] = useUrlDateRangeState(DEFAULT_RANGE);
  const params = useSearchParams();
  const router = useRouter();
  const rawSource = params.get("source");
  const source: Source | "all" =
    rawSource && Object.hasOwn(SOURCE_LABELS, rawSource)
      ? (rawSource as Source)
      : "all";
  const includeInternal = params.get("include_internal") === "true";
  const [report, setReport] = useState<ProviderCommsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === "all" || value === "false") next.delete(key);
    else next.set(key, value);
    router.replace(`/admin/provider-comms${next.size ? `?${next}` : ""}`, {
      scroll: false,
    });
  }
  useEffect(() => {
    const controller = new AbortController();
    const { from, to } = resolveRange(range);
    if (!from) {
      setReport(null);
      setLoading(false);
      setError("Choose a dated reporting period of up to 90 days.");
      return () => controller.abort();
    }
    const query = new URLSearchParams();
    if (from) query.set("date_from", from);
    if (to) query.set("date_to", to);
    if (includeInternal) query.set("include_internal", "true");
    // Never show a previous period under newly selected filters.
    setLoading(true);
    setError(null);
    setReport(null);
    fetch(`/api/admin/provider-comms?${query}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error ?? "Could not load report");
        return result as ProviderCommsReport;
      })
      .then((result) => {
        if (!controller.signal.aborted) setReport(result);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [range, includeInternal, refresh]);
  return (
    <ProviderCommsReportView
      range={range}
      source={source}
      includeInternal={includeInternal}
      report={report}
      loading={loading}
      error={error}
      onRangeChange={setRange}
      onSourceChange={(value) => setParam("source", value)}
      onInternalChange={(value) => setParam("include_internal", String(value))}
      onRefresh={() => setRefresh((n) => n + 1)}
    />
  );
}

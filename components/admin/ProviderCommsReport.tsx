"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import DateRangePopover, {
  type DateRangeValue,
} from "@/components/admin/DateRangePopover";
import {
  ONBOARDING_MESSAGES,
  SOURCE_LABELS,
  summarizeRecipients,
  type Source,
  type ProviderCommsReport,
  type DeliveryState,
  type OnboardingType,
} from "@/lib/provider-comms/reporting";

const PRESETS = [
  { label: "Last 7 days", value: "7d" as const },
  { label: "Last 30 days", value: "30d" as const },
  { label: "Last 90 days", value: "90d" as const },
];
const STATE_LABELS: Record<DeliveryState, string> = {
  delivered: "Delivered",
  accepted: "Awaiting delivery",
  pending: "Pending attempt",
  suppressed: "Suppressed",
  failed: "Send failed",
  bounced: "Bounced",
  complained: "Spam complaint",
};
const pct = (n: number, denominator: number) =>
  denominator ? `${((100 * n) / denominator).toFixed(1)}%` : "—";
const date = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
const control =
  "min-h-10 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus-visible:outline-teal-600";

interface Props {
  range: DateRangeValue;
  source: Source | "all";
  includeInternal: boolean;
  report: ProviderCommsReport | null;
  loading: boolean;
  error: string | null;
  onRangeChange: (value: DateRangeValue) => void;
  onSourceChange: (value: string) => void;
  onInternalChange: (value: boolean) => void;
  onRefresh: () => void;
}
export default function ProviderCommsReportView({
  range,
  source,
  includeInternal,
  report,
  loading,
  error,
  onRangeChange,
  onSourceChange,
  onInternalChange,
  onRefresh,
}: Props) {
  const [message, setMessage] = useState<OnboardingType | "all">("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const rows = useMemo(
    () =>
      report?.recipients.filter(
        (row) => source === "all" || row.source === source,
      ) ?? [],
    [report, source],
  );
  const performance = useMemo(() => summarizeRecipients(rows), [rows]);
  const recipients = useMemo(
    () =>
      rows.filter(
        (row) =>
          (message === "all" || row.type === message) &&
          (status === "all" ||
            (status === "clicked" ? row.clicked :
              status === "settings" ? row.settingsViewed :
              status === "saved" ? row.preferenceSaved :
              status === "sms" ? row.smsEnabled : row.state === status)),
      ),
    [rows, message, status],
  );
  useEffect(() => setPage(0), [source, report, message, status]);
  const pageCount = Math.max(1, Math.ceil(recipients.length / 25));
  const safePage = Math.min(page, pageCount - 1);
  const deliveredProviders = new Set(
    rows.filter((row) => row.delivered).map((row) => row.providerKey),
  ).size;
  const clickedProviders = new Set(
    rows.filter((row) => row.clicked).map((row) => row.providerKey),
  ).size;
  const attentionProviders = new Set(
    rows
      .filter((row) =>
        ["suppressed", "failed", "bounced", "complained"].includes(row.state),
      )
      .map((row) => row.providerKey),
  ).size;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <AdminPageHeader
        title="Provider Comms"
        description="From a claimed profile to an active provider. See how onboarding messages are landing."
        breadcrumbs={[{ label: "Operations", href: "/admin" }]}
        actions={
          <Link href="/admin/automations" className={control}>
            Automations →
          </Link>
        }
      />
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <p className="mb-1 text-xs font-medium text-gray-500">
            Message attempt date · Central Time
          </p>
          <DateRangePopover
            value={range}
            onChange={onRangeChange}
            presets={PRESETS}
          />
        </div>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
          Acquisition source
          <select
            className={control}
            value={source}
            onChange={(e) => onSourceChange(e.target.value)}
          >
            <option value="all">All sources</option>
            {Object.entries(SOURCE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-10 items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={includeInternal}
            onChange={(e) => onInternalChange(e.target.checked)}
          />
          Include internal recipients
        </label>
        <button className={control} disabled={loading} onClick={onRefresh}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>
      {error && (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}{" "}
          <button className="ml-2 underline" onClick={onRefresh}>
            Retry
          </button>
        </div>
      )}
      {loading && (
        <div
          role="status"
          className="rounded-xl border border-gray-200 p-8 text-sm text-gray-500"
        >
          Loading onboarding performance…
        </div>
      )}
      {report && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                label: "Providers reached",
                value: deliveredProviders,
                detail: "At least one delivered onboarding email",
              },
              {
                label: "Providers who clicked",
                value: clickedProviders,
                detail: "Recorded clicks across onboarding emails",
              },
              {
                label: "Delivery exceptions",
                value: attentionProviders,
                detail:
                  "Providers with suppression, failure, bounce or complaint",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-gray-200 bg-white p-5"
              >
                <p className="text-sm text-gray-500">{stat.label}</p>
                <p className="mt-2 text-3xl font-semibold tabular-nums text-gray-900">
                  {stat.value}
                </p>
                <p className="mt-2 text-xs text-gray-500">{stat.detail}</p>
              </div>
            ))}
          </div>
          <section className="mt-8" aria-labelledby="onboarding-heading">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2
                  id="onboarding-heading"
                  className="text-lg font-semibold text-gray-900"
                >
                  Onboarding journey
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Messages in the order providers experience them. Select a
                  message to inspect recipients.
                </p>
              </div>
              <Link
                href="/admin/provider-outreach"
                className="text-sm text-teal-700 hover:underline"
              >
                Cold outreach workflow →
              </Link>
            </div>
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs text-gray-500">
                  <tr>
                    {[
                      "Message",
                      "Attempts",
                      "Delivered",
                      "Opened",
                      "Clicked",
                      "CTR",
                      "Settings opened",
                      "Preference saved",
                      "SMS preference enabled",
                      "Suppressed",
                      "Failed",
                    ].map((title) => (
                      <th key={title} className="px-4 py-3 font-medium">
                        {title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {performance.map((row) => {
                    const definition = ONBOARDING_MESSAGES.find(
                      (m) => m.type === row.type,
                    )!;
                    return (
                      <tr key={row.type} className="border-b last:border-0">
                        <td className="min-w-64 px-4 py-4">
                          <button
                            className="font-medium text-teal-800 hover:underline"
                            onClick={() => {
                              setMessage(row.type);
                              setStatus("all");
                              document
                                .getElementById("recipients-heading")
                                ?.scrollIntoView({
                                  block: "start",
                                  behavior: "smooth",
                                });
                            }}
                          >
                            {definition.label}
                          </button>
                          <p className="mt-1 text-xs text-gray-500">
                            {definition.timing}
                          </p>
                          <p className="mt-1 text-xs text-gray-600">
                            Goal: {definition.action}
                          </p>
                          <Link
                            className="mt-2 inline-block text-xs text-teal-700 hover:underline"
                            href={`/admin/automations/${definition.automation}#email-samples`}
                          >
                            Preview & run history →
                          </Link>
                        </td>
                        {[
                          row.attempts,
                          row.delivered,
                          row.opened,
                          row.clicked,
                          pct(row.clicked, row.delivered),
                          row.type === "notification_setup_nudge" ? row.settingsViewed : "—",
                          row.type === "notification_setup_nudge" ? row.preferenceSaved : "—",
                          row.type === "notification_setup_nudge" ? row.smsEnabled : "—",
                          row.suppressed,
                          row.failed,
                        ].map((value, i) => (
                          <td
                            key={i}
                            className="px-4 py-4 tabular-nums text-gray-800"
                          >
                            {value}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-gray-500">
              Counts are messages, not unique providers. CTR = clicked messages
              ÷ delivered messages. Opens and clicks are recorded signals, not
              proof of a completed task. Attempts include suppression and
              failure; these are excluded from delivered totals. Notification outcomes
              count distinct messages with a linked action within seven days of send.
              Recent messages have an incomplete observation window. Saved preferences
              include disabling a channel; SMS enabled counts an explicit choice of on from off or unset,
              not proof of a delivered text.
            </p>
            {rows.length === 0 && (
              <p className="mt-4 rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
                No onboarding messages match this period and source. Try a
                broader range or all sources.
              </p>
            )}
          </section>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="font-semibold text-gray-900">
                Did providers take the next step?
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                Email-attributed profile edits:{" "}
                <strong className="font-medium">not yet measured</strong>.
                Profile activity exists, but it is not reliably linked to the
                originating message.
              </p>
              <Link
                href="/admin/activity?actor=providers"
                className="mt-3 inline-block text-sm text-teal-700 hover:underline"
              >
                Inspect activity →
              </Link>
            </section>
            <section className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="font-semibold text-gray-900">What comes next</h2>
              <p className="mt-2 text-sm text-gray-600">
                Notification setup is registered; check its automation for launch or pause status.
                The 21-day verification reminder is registered; check its automation for launch status. Verification completion is not yet attributed to emails.
              </p>
              <p className="mt-2 text-xs text-gray-500">
                Eligibility and messages waiting for a business-hour send window
                are not yet measured in this report.
              </p>
            </section>
          </div>
          <section className="mt-8" aria-labelledby="recipients-heading">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2
                  id="recipients-heading"
                  className="text-lg font-semibold text-gray-900"
                >
                  Recipients & delivery details
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  {recipients.length} message attempts · Open a provider for
                  their communication timeline.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="sr-only" htmlFor="message-filter">
                  Message
                </label>
                <select
                  id="message-filter"
                  className={control}
                  value={message}
                  onChange={(e) =>
                    setMessage(e.target.value as OnboardingType | "all")
                  }
                >
                  <option value="all">All onboarding messages</option>
                  {ONBOARDING_MESSAGES.map((m) => (
                    <option key={m.type} value={m.type}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <label className="sr-only" htmlFor="delivery-filter">
                  Delivery status
                </label>
                <select
                  id="delivery-filter"
                  className={control}
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="all">All delivery states</option>
                  <option value="clicked">Recorded click</option>
                  <option value="settings">Opened notification settings</option>
                  <option value="saved">Saved a preference</option>
                  <option value="sms">Enabled SMS</option>
                  {Object.entries(STATE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs text-gray-500">
                  <tr>
                    {[
                      "Provider / recipient",
                      "Message",
                      "Source",
                      "Delivery",
                      "Engagement",
                      "Attempted · CT",
                    ].map((label) => (
                      <th key={label} className="px-4 py-3 font-medium">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recipients
                    .slice(safePage * 25, safePage * 25 + 25)
                    .map((row) => (
                      <tr key={row.id} className="border-b last:border-0">
                        <td className="min-w-56 max-w-xs break-words px-4 py-3">
                          {row.directoryId ? (
                            <Link
                              href={`/admin/directory/${encodeURIComponent(row.directoryId)}`}
                              className="font-medium text-teal-800 hover:underline"
                            >
                              {row.providerName}
                            </Link>
                          ) : (
                            <span>{row.providerName}</span>
                          )}
                          <p className="mt-1 text-xs text-gray-500">
                            {row.email}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            className="text-teal-700 hover:underline"
                            href={`/admin/emails?email_type=${row.type}&search=${encodeURIComponent(row.email)}`}
                          >
                            {
                              ONBOARDING_MESSAGES.find(
                                (m) => m.type === row.type,
                              )?.label
                            }
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          {SOURCE_LABELS[row.source]}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={
                              row.state === "failed" || row.state === "bounced"
                                ? "text-red-700"
                                : "text-gray-700"
                            }
                          >
                            {STATE_LABELS[row.state]}
                          </span>
                          {row.reason && (
                            <p className="mt-1 max-w-56 text-xs text-gray-500">
                              {row.reason}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          {row.smsEnabled ? "SMS enabled · " : row.preferenceSaved ? "Preference saved · " : row.settingsViewed ? "Settings opened · " : ""}
                          {row.clicked
                            ? "Clicked"
                            : row.opened
                              ? "Opened"
                              : "No recorded engagement"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                          {date(row.attemptedAt)}
                        </td>
                      </tr>
                    ))}
                  {!recipients.length && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-8 text-center text-gray-500"
                      >
                        No recipients match these filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between text-sm text-gray-500">
              <span>
                Page {safePage + 1} of {pageCount}
              </span>
              <div className="flex gap-2">
                <button
                  className={control}
                  disabled={safePage === 0}
                  onClick={() => setPage(safePage - 1)}
                >
                  Previous
                </button>
                <button
                  className={control}
                  disabled={safePage + 1 >= pageCount}
                  onClick={() => setPage(safePage + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </section>
          <details className="mt-6 border-t border-gray-200 pt-4 text-sm text-gray-600">
            <summary className="cursor-pointer font-medium">
              How to read this report
            </summary>
            <div className="mt-3 space-y-2 leading-relaxed">
              <p>
                Outreach before claim means a dated outreach record preceded the
                claim. It does not prove outreach caused the claim. Missing or
                later outreach records remain source unknown; unknown does not
                mean organic.
              </p>
              <p>
                Delivery and engagement reflect the latest recorded state of
                messages attempted in the selected period. Suppression can
                reflect a provider’s contact preferences and should not
                automatically prompt a retry.
              </p>
              <p>
                {report.excludedInternal} internal-domain attempts excluded.{" "}
                {report.unresolved} attempts could not be linked to an
                unambiguous provider profile. Internal filtering covers
                @olera.care addresses only.
              </p>
              <p>
                Updated {date(report.generatedAt)} CT.{" "}
                <Link
                  href="/admin/deliverability"
                  className="text-teal-700 underline"
                >
                  Deliverability
                </Link>{" "}
                focuses on missed demand notifications; use this report for
                onboarding exceptions.
              </p>
            </div>
          </details>
        </>
      )}
    </div>
  );
}

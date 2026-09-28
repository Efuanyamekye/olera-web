"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import DateRangePopover, { type DateRangeValue, resolveRange } from "@/components/admin/DateRangePopover";

/**
 * /admin/medjobs/email-health — Student email deliverability dashboard.
 *
 * Shows which students have email delivery problems (bounces, complaints) and
 * aggregate engagement metrics (open rates, click rates). A student with a
 * bounced email can't receive interview requests or profile approvals.
 */

type Status = "healthy" | "bounced" | "complained";
type Filter = "all" | "bounced" | "complained" | "healthy";

interface Student {
  email: string;
  profileId: string | null;
  name: string;
  slug: string | null;
  university: string | null;
  phone: string | null;
  imageUrl: string | null;
  isActive: boolean;
  isApproved: boolean;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  openRate: number;
  clickRate: number;
  status: Status;
  lastEmailAt: string | null;
  lastBouncedAt: string | null;
  lastComplainedAt: string | null;
}

interface Summary {
  totalStudents: number;
  totalSent: number;
  totalDelivered: number;
  totalOpened: number;
  totalClicked: number;
  totalBounced: number;
  totalComplaints: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
  complaintRate: number;
  bouncedStudents: number;
  complainedStudents: number;
  healthyStudents: number;
}

interface Payload {
  windowDays: number;
  dateRange: { from: string; to: string | null } | null;
  generatedAt: string;
  summary: Summary;
  students: Student[];
  pagination: {
    page: number;
    perPage: number;
    totalStudents: number;
    totalPages: number;
  };
}

const STATUS_STYLE: Record<Status, { label: string; cls: string; remedy: string }> = {
  complained: {
    label: "Complained",
    cls: "bg-red-50 text-red-700 ring-1 ring-red-200",
    remedy: "Contact directly via phone. Never re-mail without explicit permission — complaint history affects deliverability.",
  },
  bounced: {
    label: "Bounced",
    cls: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    remedy: "Email address may be incorrect or inbox full. Ask student to update their email in the portal.",
  },
  healthy: {
    label: "Healthy",
    cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    remedy: "No delivery issues detected.",
  },
};

function relative(iso: string | null): string {
  if (!iso) return "—";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

function Stat({ value, label, detail, tone = "default" }: {
  value: string | number;
  label: string;
  detail: string;
  tone?: "default" | "danger" | "success" | "muted";
}) {
  const colors = {
    default: "text-gray-950",
    danger: "text-red-600",
    success: "text-emerald-600",
    muted: "text-gray-400",
  };
  return (
    <div className="min-h-20 rounded-xl border border-gray-200 bg-white px-4 py-3">
      <span className={`block text-2xl font-semibold leading-none tabular-nums ${colors[tone]}`}>
        {value}
      </span>
      <span className="mt-2 block text-xs font-semibold text-gray-700">{label}</span>
      <span className="mt-0.5 block text-[11px] text-gray-400">{detail}</span>
    </div>
  );
}

export default function StudentEmailHealthPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRangeValue>({
    preset: "all",
    customFrom: "",
    customTo: "",
  });

  const load = useCallback(async (p: number = 1, f: Filter = filter, range?: DateRangeValue) => {
    setLoading(true);
    setErr(null);
    try {
      const effectiveRange = range ?? dateRange;
      const { from, to } = resolveRange(effectiveRange);
      const params = new URLSearchParams({ page: String(p), filter: f });
      if (from) params.set("from", from);
      if (to) params.set("to", to);

      const res = await fetch(`/api/admin/students/email-health?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const payload = await res.json();
      setData(payload);
      setPage(p);
      setFilter(f);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [filter, dateRange]);

  useEffect(() => {
    void load(1, "all"); // Default to all time (dateRange.preset = "all")
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilterChange = (newFilter: Filter) => {
    setFilter(newFilter);
    setExpanded(null);
    void load(1, newFilter);
  };

  const handlePageChange = (newPage: number) => {
    setExpanded(null);
    void load(newPage, filter);
  };

  const handleDateRangeChange = (newRange: DateRangeValue) => {
    setDateRange(newRange);
    setExpanded(null);
    void load(1, filter, newRange);
  };

  const chips: Array<[Filter, string, number | undefined]> = useMemo(() => {
    if (!data) return [];
    const s = data.summary;
    return [
      ["all", "All", s.totalStudents],
      ["complained", "Complained", s.complainedStudents],
      ["bounced", "Bounced", s.bouncedStudents],
      ["healthy", "Healthy", s.healthyStudents],
    ];
  }, [data]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <AdminPageHeader
          title="Student Email Health"
          description="Email deliverability and engagement metrics for MedJobs students."
          breadcrumbs={[
            { label: "MedJobs", href: "/admin/caregivers" },
          ]}
        />
        <DateRangePopover value={dateRange} onChange={handleDateRangeChange} />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link
          href="/admin/emails?recipient_type=student"
          className="inline-flex min-h-9 items-center rounded-full border border-gray-200 bg-white px-4 text-xs font-semibold text-gray-600 hover:border-gray-300"
        >
          View all student emails →
        </Link>
        <button
          type="button"
          onClick={() => void load(1, filter)}
          disabled={loading}
          className="inline-flex min-h-9 items-center rounded-full border border-gray-200 bg-white px-4 text-xs font-semibold text-gray-600 hover:border-gray-300 disabled:opacity-50"
        >
          {loading && data ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {loading && !data && <div className="mt-6 h-24 animate-pulse rounded-xl bg-gray-100" />}
      {err && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Couldn&rsquo;t load: {err}
        </div>
      )}

      {data && (
        <>
          {/* Summary Stats */}
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              value={data.summary.totalStudents}
              label="Students emailed"
              detail={`${data.summary.totalSent} emails sent`}
            />
            <Stat
              value={`${data.summary.openRate}%`}
              label="Open rate"
              detail={`${data.summary.totalOpened} of ${data.summary.totalDelivered} delivered`}
              tone={data.summary.openRate >= 50 ? "success" : data.summary.openRate >= 30 ? "default" : "muted"}
            />
            <Stat
              value={data.summary.complainedStudents + data.summary.bouncedStudents}
              label="Problem addresses"
              detail={`${data.summary.complainedStudents} complained, ${data.summary.bouncedStudents} bounced`}
              tone={data.summary.complainedStudents + data.summary.bouncedStudents > 0 ? "danger" : "muted"}
            />
            <Stat
              value={`${data.summary.clickRate}%`}
              label="Click rate"
              detail={`${data.summary.totalClicked} of ${data.summary.totalDelivered} delivered`}
              tone={data.summary.clickRate >= 20 ? "success" : data.summary.clickRate >= 10 ? "default" : "muted"}
            />
          </div>

          {/* Filters */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-t-xl border border-b-0 border-gray-200 bg-gray-50 px-4 py-3">
            <div className="flex flex-wrap gap-1.5">
              {chips.map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleFilterChange(value)}
                  aria-pressed={filter === value}
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
                    filter === value
                      ? "bg-gray-900 text-white"
                      : "border border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                  }`}
                >
                  {label} {count !== undefined && count}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-b-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-gray-400">
                  <th className="px-4 py-2.5 font-medium">Student</th>
                  <th className="px-4 py-2.5 font-medium">Email</th>
                  <th className="px-4 py-2.5 text-right font-medium">Sent</th>
                  <th className="px-4 py-2.5 text-right font-medium">Open %</th>
                  <th className="px-4 py-2.5 text-right font-medium">Click %</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Last Email</th>
                </tr>
              </thead>
              <tbody>
                {data.students.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">
                      {data.summary.totalStudents === 0
                        ? "No student emails in this window."
                        : "No students match this filter."}
                    </td>
                  </tr>
                )}
                {data.students.map((student) => {
                  const style = STATUS_STYLE[student.status];
                  const open = expanded === student.email;
                  return (
                    <tr
                      key={student.email}
                      onClick={() => setExpanded(open ? null : student.email)}
                      className={`cursor-pointer border-b border-gray-100 align-top last:border-b-0 hover:bg-gray-50 ${
                        student.status === "complained" ? "bg-red-50/40" : student.status === "bounced" ? "bg-amber-50/40" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {student.imageUrl ? (
                            <Image
                              src={student.imageUrl}
                              alt=""
                              width={32}
                              height={32}
                              className="h-8 w-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-500">
                              {student.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <span className="font-semibold text-gray-900">{student.name}</span>
                            {student.university && (
                              <span className="mt-0.5 block text-[11px] text-gray-400">{student.university}</span>
                            )}
                          </div>
                        </div>
                        {open && (
                          <div className="mt-3 space-y-2 rounded-lg bg-gray-50 p-3 text-[11px] text-gray-600">
                            <div className="font-mono break-all text-gray-700">{student.email}</div>
                            <div>
                              Phone:{" "}
                              {student.phone ? (
                                <span className="font-mono">{student.phone}</span>
                              ) : (
                                <span className="text-gray-400">none on file</span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-3">
                              <span>Sent: {student.sent}</span>
                              <span>Delivered: {student.delivered}</span>
                              <span>Opened: {student.opened}</span>
                              <span>Clicked: {student.clicked}</span>
                              {student.bounced > 0 && (
                                <span className="text-amber-700">Bounced: {student.bounced}</span>
                              )}
                              {student.complained > 0 && (
                                <span className="text-red-700">Complained: {student.complained}</span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2 pt-1">
                              {student.isApproved && (
                                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700">Approved</span>
                              )}
                              {student.isActive && (
                                <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-700">Active</span>
                              )}
                              {!student.isApproved && !student.isActive && (
                                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-500">Not live</span>
                              )}
                            </div>
                            <div className="pt-1 font-medium text-gray-800">{style.remedy}</div>
                            <div className="flex gap-3 pt-1">
                              {/* Always show profile link - search works even without slug */}
                              <Link
                                href={`/admin/caregivers?search=${encodeURIComponent(student.email)}`}
                                onClick={(e) => e.stopPropagation()}
                                className="font-semibold text-teal-700 hover:underline"
                              >
                                View profile →
                              </Link>
                              <Link
                                href={`/admin/emails?recipient_type=student&search=${encodeURIComponent(student.email)}`}
                                onClick={(e) => e.stopPropagation()}
                                className="font-semibold text-teal-700 hover:underline"
                              >
                                Email history →
                              </Link>
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-[11px] text-gray-600 truncate max-w-[200px] block">
                          {student.email}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-gray-700">
                        {student.sent}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-gray-700">
                        {student.openRate}%
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-gray-700">
                        {student.clickRate}%
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-[10px] font-semibold ${style.cls}`}>
                          {style.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[11px] tabular-nums text-gray-500">
                        {relative(student.lastEmailAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-[11px] text-gray-400">
                Page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.totalStudents} students)
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page <= 1 || loading}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-gray-300 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= data.pagination.totalPages || loading}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-gray-300 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
            Showing email metrics for students with at least one email{data.windowDays > 0 ? ` in the last ${data.windowDays} days` : ""}.
            Complaint rate is critical — even one complaint can affect deliverability. For bounced addresses,
            ask the student to verify or update their email in the portal.
          </p>
        </>
      )}
    </div>
  );
}

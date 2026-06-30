"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { use } from "react";
import { Drawer } from "../../Drawer";
import { AddStakeholderModal } from "../../AddStakeholderModal";
import { BulkProfessorImportModal } from "../../BulkProfessorImportModal";
import {
  STAKEHOLDER_TYPE_LABELS,
  STATUS_LABELS,
  type Campus,
  type DrawerContext,
  type OutreachRow,
  type StakeholderType,
  type Status,
} from "@/lib/student-outreach/types";
import type { ProviderProspectRow } from "@/lib/student-outreach/tab-config";

interface CampusResponse {
  campus: Campus;
  stakeholders_by_type: Record<StakeholderType, OutreachRow[]>;
  providers: OutreachRow[];
  total: number;
  status_summary: Partial<Record<Status, number>>;
}

const TYPE_ORDER: StakeholderType[] = ["student_org", "advisor", "dept_head", "professor"];

export default function CampusDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [data, setData] = useState<CampusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  // Provider PROSPECTS are virtual (live catchment), not saved rows — fetched
  // separately, like the In-Basket Providers tab, so the page shows prospects
  // alongside already-contacted providers.
  const [providerProspects, setProviderProspects] = useState<ProviderProspectRow[]>([]);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const [res, ppRes] = await Promise.all([
        fetch(`/api/admin/student-outreach/campuses/${slug}`),
        fetch(`/api/admin/medjobs/provider-prospects?campus=${slug}`),
      ]);
      // Guard against empty/non-JSON bodies (e.g. a 500) so we surface a real
      // message instead of "Unexpected end of JSON input".
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error ?? `Load failed (${res.status})`);
      if (!d) throw new Error("Load failed");
      setData(d);
      const pp = await ppRes.json().catch(() => null);
      setProviderProspects((pp?.rows ?? []) as ProviderProspectRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  // Materialize a virtual prospect into a row, then open its drawer.
  const startProviderOutreach = useCallback(
    async (p: ProviderProspectRow) => {
      try {
        const res = await fetch("/api/admin/medjobs/provider-prospects/materialize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider_id: p.provider_id, campus_id: p.campus_id }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error || "Failed to materialize");
        setOpenId(body.id);
        void refetch();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to open prospect");
      }
    },
    [refetch],
  );

  useEffect(() => { refetch(); }, [refetch]);

  const parentCandidates = useMemo<OutreachRow[]>(() => {
    if (!data) return [];
    return [...data.stakeholders_by_type.dept_head, ...data.stakeholders_by_type.advisor];
  }, [data]);

  const handleDrawerAction = useCallback(async (_ctx: DrawerContext | null) => {
    await refetch();
  }, [refetch]);

  if (loading) return <p className="py-8 text-center text-sm text-gray-400">Loading…</p>;
  if (error) return <p className="py-8 text-center text-sm text-red-600">{error}</p>;
  if (!data) return null;

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <Link href="/admin/medjobs/sites" className="text-xs text-gray-500 hover:underline">
            ← All sites
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">{data.campus.name}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {[data.campus.city, data.campus.state].filter(Boolean).join(", ") || "—"}
            {" · "}
            {data.total} stakeholder{data.total === 1 ? "" : "s"}
            {summarize(data.status_summary)}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowBulk(true)}
            disabled={parentCandidates.length === 0}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            title={parentCandidates.length === 0 ? "Add a Dept Head or Advisor first" : ""}
          >
            Bulk import professors
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            + Add stakeholder
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {((data.providers ?? []).length > 0 || providerProspects.length > 0) && (
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Providers ({(data.providers?.length ?? 0) + providerProspects.length})
            </h2>
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100 bg-white">
              {(data.providers ?? []).map((r) => (
                <li key={r.id}>
                  <RowButton row={r} onClick={() => setOpenId(r.id)} />
                </li>
              ))}
              {providerProspects.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => startProviderOutreach(p)}
                    className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-gray-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{p.provider_name}</p>
                      <p className="truncate text-xs text-gray-500">
                        {[p.city, p.state].filter(Boolean).join(", ") || "—"}
                      </p>
                    </div>
                    <span className="whitespace-nowrap rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                      Prospect
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {TYPE_ORDER.map((type) => {
          const rows: OutreachRow[] = data.stakeholders_by_type[type] ?? [];
          if (rows.length === 0) return null;
          if (type === "professor") {
            const byPerm = groupBy(rows, (r: OutreachRow) => r.contact_permission);
            return (
              <section key={type}>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  {STAKEHOLDER_TYPE_LABELS[type]} ({rows.length})
                </h2>
                <div className="space-y-3">
                  {Object.entries(byPerm).map(([perm, list]) => (
                    <div key={perm}>
                      <p className="mb-1 text-xs font-medium text-gray-600">
                        Permission: {perm}
                      </p>
                      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100 bg-white">
                        {list.map((r) => (
                          <li key={r.id}>
                            <RowButton row={r} onClick={() => setOpenId(r.id)} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            );
          }
          return (
            <section key={type}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                {STAKEHOLDER_TYPE_LABELS[type]} ({rows.length})
              </h2>
              <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100 bg-white">
                {rows.map((r) => (
                  <li key={r.id}>
                    <RowButton row={r} onClick={() => setOpenId(r.id)} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {data.total === 0 && (
          <p className="py-12 text-center text-sm text-gray-400">
            No stakeholders yet. Add a student org, advisor, or dept head to get started.
          </p>
        )}
      </div>

      {openId && (
        <Drawer
          outreachId={openId}
          onClose={() => setOpenId(null)}
          onAction={handleDrawerAction}
        />
      )}
      {showAdd && (
        <AddStakeholderModal
          campuses={[data.campus]}
          defaultCampusSlug={data.campus.slug}
          onClose={() => setShowAdd(false)}
          onCreated={(id) => { setShowAdd(false); refetch(); setOpenId(id); }}
        />
      )}
      {showBulk && (
        <BulkProfessorImportModal
          parentCandidates={parentCandidates}
          onClose={() => setShowBulk(false)}
          onCreated={() => { refetch(); }}
        />
      )}
    </div>
  );
}

function RowButton({ row, onClick }: { row: OutreachRow; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-gray-50"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">
          {row.organization_name}
          {row.department && <span className="ml-1 text-gray-500">· {row.department}</span>}
        </p>
        <p className="truncate text-xs text-gray-500">
          Last edited {new Date(row.last_edited_at).toLocaleDateString()}
        </p>
      </div>
      <StatusBadge status={row.status} />
    </button>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const styles: Record<Status, string> = {
    prospect: "bg-gray-100 text-gray-700",
    researched: "bg-gray-100 text-gray-700",
    outreach_sent: "bg-blue-50 text-blue-700",
    engaged: "bg-blue-100 text-blue-800",
    meeting_scheduled: "bg-indigo-50 text-indigo-700",
    active_partner: "bg-emerald-100 text-emerald-800",
    not_interested: "bg-gray-100 text-gray-500",
    no_response_closed: "bg-gray-100 text-gray-500",
    do_not_contact: "bg-red-50 text-red-700",
    wrong_contact: "bg-gray-100 text-gray-500",
    redirected: "bg-gray-100 text-gray-500",
    archived: "bg-amber-50 text-amber-700",
  };
  return (
    <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? "bg-gray-100 text-gray-700"}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function summarize(summary: Partial<Record<Status, number>>): string {
  const items: string[] = [];
  const interesting: Status[] = ["active_partner", "engaged", "meeting_scheduled"];
  for (const s of interesting) {
    if (summary[s]) items.push(`${summary[s]} ${STATUS_LABELS[s].toLowerCase()}`);
  }
  return items.length ? ` · ${items.join(" · ")}` : "";
}

function groupBy<T, K extends string>(arr: T[], fn: (item: T) => K): Record<K, T[]> {
  const out: Partial<Record<K, T[]>> = {};
  for (const item of arr) {
    const k = fn(item);
    (out[k] ??= []).push(item);
  }
  return out as Record<K, T[]>;
}

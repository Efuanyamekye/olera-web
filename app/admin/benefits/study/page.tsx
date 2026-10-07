"use client";

/**
 * /admin/benefits/study: the CARE-NAV study's view of the product (8 Oct 2026).
 *
 * Two things the research team needs under the iterative model: the dated log
 * of what changed (lib/benefits/study-versions.ts), and for each participant,
 * which versions they were exposed to, for how long, and what they did on
 * each. "Changed since they joined" is what to ask about at the 4-week and
 * 3-month follow-ups.
 */

import Link from "next/link";
import { useEffect, useState } from "react";

type Experience = "questions" | "recommendations" | "apply_follow_up";
type Version = { id: string; releasedAt: string; changed: Experience[]; summary: string; prs: number[] };
type Exposure = { version: string; from: string; to: string | null; days: number; events: number; sends: number };
type Participant = {
  profileId: string;
  name: string | null;
  state: string | null;
  cohort: string | null;
  joinedAt: string;
  planVersion: string | null;
  firstStep: string | null;
  applied: { at: string; decision: string | null; decisionAt: string | null } | null;
  exposure: Exposure[];
  changedSinceJoined: string[];
};
type Unsaved = { cohort: string; first: string; last: string; events: number };

const EXPERIENCE: Record<Experience, string> = {
  questions: "Questions",
  recommendations: "Recommendations",
  apply_follow_up: "Applying and follow-up",
};

const DECISION: Record<string, string> = {
  approved: "Approved",
  waiting: "Still waiting",
  denied: "Told no",
  stuck: "Stuck",
};

function day(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function StudyPage() {
  const [data, setData] = useState<{ versions: Version[]; participants: Participant[]; unsaved: Unsaved[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/benefits/study", { cache: "no-store" })
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (!r.ok) setError(body?.error || `Couldn't load (${r.status}). Try refreshing.`);
        else setData(body);
      })
      .catch(() => setError("Network error. Try refreshing."));
  }, []);

  const versions = data ? [...data.versions].reverse() : [];
  const byId = new Map((data?.versions ?? []).map((v) => [v.id, v]));
  const study = versions.filter((v) => Number(v.id) >= 1);
  const before = versions.filter((v) => Number(v.id) < 1);

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <Link href="/admin/benefits" className="text-xs text-gray-400 hover:text-gray-700">← Benefits</Link>
        <h1 className="text-2xl font-semibold text-gray-900 mt-1">CARE-NAV study</h1>
        <p className="text-sm text-gray-500 mt-1 max-w-2xl">
          Every participant gets the current product. Each change a family would notice is a dated version below,
          and each participant shows which versions they were on, for how long, and what they did.
        </p>
      </div>

      {error && <p className="text-sm text-rose-700">{error}</p>}
      {!error && !data && <p className="text-sm text-gray-400">Loading…</p>}

      {data && (
        <>
          <section className="mb-10">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Participants</h2>
            {data.participants.length === 0 ? (
              <p className="text-sm text-gray-500">
                No one has saved a plan from a study link yet. Study links look like olera.care/senior-benefits?cohort=v1
                {data.unsaved.length > 0 && <> · {data.unsaved.length} tagged {data.unsaved.length === 1 ? "visitor has" : "visitors have"} started without saving</>}.
              </p>
            ) : (
              <>
                {data.unsaved.length > 0 && (
                  <p className="text-sm text-gray-500 mb-3">
                    Plus {data.unsaved.length} tagged {data.unsaved.length === 1 ? "visitor" : "visitors"} who started but haven&apos;t saved a plan.
                  </p>
                )}
                <ul className="divide-y divide-gray-100 border-y border-gray-100">
                  {data.participants.map((p) => {
                    const isOpen = open === p.profileId;
                    return (
                      <li key={p.profileId} className="py-3">
                        <button onClick={() => setOpen(isOpen ? null : p.profileId)} className="w-full text-left flex items-baseline gap-3">
                          <span className="font-medium text-gray-900">{p.name || "A family"}</span>
                          <span className="text-sm text-gray-500 truncate">
                            {[p.cohort, p.state, `joined ${day(p.joinedAt)}`, p.applied ? (p.applied.decision ? DECISION[p.applied.decision] ?? p.applied.decision : `applied ${day(p.applied.at)}`) : null].filter(Boolean).join(" · ")}
                          </span>
                          <span className="ml-auto text-sm text-gray-500 shrink-0">
                            {p.changedSinceJoined.length ? `${p.changedSinceJoined.length} ${p.changedSinceJoined.length === 1 ? "change" : "changes"} since` : "No changes since"}
                          </span>
                        </button>
                        {isOpen && (
                          <div className="mt-3 pl-1 text-sm text-gray-700 space-y-3">
                            <table className="w-full text-left">
                              <thead>
                                <tr className="text-gray-400">
                                  <th className="font-normal pb-1">Version</th>
                                  <th className="font-normal pb-1">On it</th>
                                  <th className="font-normal pb-1 text-right">Screens</th>
                                  <th className="font-normal pb-1 text-right">Messages</th>
                                </tr>
                              </thead>
                              <tbody className="tabular-nums">
                                {p.exposure.map((e) => (
                                  <tr key={e.version}>
                                    <td className="py-0.5">{e.version}</td>
                                    <td>{day(e.from)} to {e.to ? day(e.to) : "now"} · {e.days} {e.days === 1 ? "day" : "days"}</td>
                                    <td className="text-right">{e.events}</td>
                                    <td className="text-right">{e.sends}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <p className="text-gray-500">
                              Plan saved on version {p.planVersion ?? "unknown"}
                              {p.applied && <> · applied {day(p.applied.at)}{p.applied.decision && <>, {DECISION[p.applied.decision]?.toLowerCase() ?? p.applied.decision} {p.applied.decisionAt ? day(p.applied.decisionAt) : ""}</>}</>}
                            </p>
                            {p.changedSinceJoined.length > 0 && (
                              <div>
                                <p className="font-medium text-gray-900">Changed since they joined</p>
                                <ul className="mt-1 space-y-1">
                                  {p.changedSinceJoined.map((id) => (
                                    <li key={id}>{id}: {byId.get(id)?.summary}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            <Link href={`/admin/care-seekers/${p.profileId}`} className="inline-block text-gray-500 underline underline-offset-2 hover:text-gray-800">
                              Open their case
                            </Link>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-1">Versions</h2>
            <p className="text-sm text-gray-500 mb-3">Newest first. Dated when the change reached families.</p>
            <VersionList versions={study} />
            {before.length > 0 && (
              <>
                <h3 className="text-sm font-medium text-gray-500 mt-6 mb-1">Before the study</h3>
                <VersionList versions={before} />
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function VersionList({ versions }: { versions: Version[] }) {
  return (
    <ul className="divide-y divide-gray-100 border-y border-gray-100">
      {versions.map((v) => (
        <li key={v.id} className="py-3 grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3">
          <span className="font-semibold text-gray-900 tabular-nums">{v.id}</span>
          <div className="min-w-0">
            <p className="text-sm text-gray-500">
              {new Date(v.releasedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · {v.changed.map((c) => EXPERIENCE[c]).join(", ")}
            </p>
            <p className="text-sm text-gray-800 mt-0.5">{v.summary}</p>
            <p className="text-xs text-gray-400 mt-1">
              {v.prs.map((n, i) => (
                <span key={n}>
                  {i > 0 && " "}
                  <a href={`https://github.com/olera-care/olera-web/pull/${n}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-gray-700">#{n}</a>
                </span>
              ))}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

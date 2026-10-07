"use client";

import Link from "next/link";
import { useState, useMemo, useEffect, useCallback } from "react";
import { useToast } from "@/components/admin/Toast";
import BenefitsFamiliesView from "@/components/admin/BenefitsFamiliesView";
import { allStates, type WaiverProgram, type StateData } from "@/data/waiver-library";
import { pipelineData, type PipelineComparison, type PipelineStateSummary } from "@/data/pipeline-summary";
import { pipelineDrafts, type PipelineDraft, type PipelineStateOverview } from "@/data/pipeline-drafts";

// ─── Draft Review Types ────────────────────────────────────────────────────

interface DraftReview {
  id: string;
  program_id: string;
  state_id: string;
  status: string;
  comment: string | null;
  reviewed_by: string;
  created_at: string;
}

const STATUSES = [
  { value: "draft", label: "Draft", color: "bg-gray-100 text-gray-600" },
  { value: "reviewed", label: "Reviewed", color: "bg-blue-100 text-blue-700" },
  { value: "needs-changes", label: "Needs Changes", color: "bg-amber-100 text-amber-700" },
  { value: "approved", label: "Approved", color: "bg-emerald-100 text-emerald-700" },
  { value: "published", label: "Published", color: "bg-primary-100 text-primary-700" },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function getVerificationStats(programs: WaiverProgram[]) {
  const verified = programs.filter((p) => p.lastVerifiedDate).length;
  const withSource = programs.filter((p) => p.sourceUrl).length;
  const savingsVerified = programs.filter((p) => p.savingsVerified).length;
  return { total: programs.length, verified, withSource, savingsVerified };
}

function getContentStats(programs: WaiverProgram[]) {
  const withIntro = programs.filter((p) => p.intro).length;
  const withFaqs = programs.filter((p) => p.faqs && p.faqs.length > 0).length;
  const withRichContent = programs.filter((p) => p.contentSections && p.contentSections.length > 0).length;
  const withAppGuide = programs.filter((p) => p.applicationGuide).length;
  const drafts = programs.filter((p) => p.contentStatus === "pipeline-draft").length;
  const reviewed = programs.filter((p) => p.contentStatus === "approved" || p.contentStatus === "published").length;
  return { withIntro, withFaqs, withRichContent, withAppGuide, drafts, reviewed };
}

type StateReadiness = "published" | "drafted" | "explored" | "scaffolding";

function getStateReadiness(state: StateData): StateReadiness {
  const pipeline = pipelineData[state.abbreviation] as PipelineStateSummary | undefined;
  const stats = getVerificationStats(state.programs);
  const content = getContentStats(state.programs);

  // Green: verified + has real content
  if (stats.verified > 0 && content.withIntro > 0) return "published";
  // Blue: drafts exist (in pipeline or on programs)
  if (pipeline?.draftsGenerated && pipeline.draftsGenerated > 0) return "drafted";
  if (content.drafts > 0) return "drafted";
  // Amber: pipeline explored but no drafts yet
  if (pipeline?.exploredAt) return "explored";
  // Gray: template scaffolding
  return "scaffolding";
}

const PROGRAM_TYPE_STYLES: Record<string, string> = {
  benefit: "bg-emerald-50 text-emerald-700",
  resource: "bg-blue-50 text-blue-700",
  navigator: "bg-violet-50 text-violet-700",
  employment: "bg-amber-50 text-amber-700",
};

function getProgramType(program: WaiverProgram): string {
  return program.programType || "benefit";
}

// ─── Components ─────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const colors = PROGRAM_TYPE_STYLES[type] || "bg-gray-50 text-gray-600";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium tracking-wide uppercase ${colors}`}>
      {type}
    </span>
  );
}

function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="h-1 w-full bg-gray-100 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${
          pct === 100 ? "bg-emerald-400" : pct > 0 ? "bg-amber-400" : "bg-gray-100"
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function PipelineDiffs({ comparison }: { comparison: PipelineComparison }) {
  if (!comparison.diffs.length && !comparison.novelFields.length) return null;

  return (
    <div className="mt-4 p-3 bg-amber-50/50 border border-amber-100 rounded-lg space-y-2">
      <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">Pipeline Findings</p>
      {comparison.diffs.map((diff, i) => (
        <div key={i} className="text-xs text-amber-800 flex items-start gap-1.5">
          <span className="text-amber-500 mt-0.5 shrink-0">&#9888;</span>
          <span>
            <span className="font-medium">{diff.field}</span>: ours says{" "}
            <span className="line-through text-amber-600">{diff.ours}</span>
            {" → "}
            <span className="font-medium">{diff.found.length > 80 ? diff.found.slice(0, 80) + "..." : diff.found}</span>
            {diff.source && (
              <a href={diff.source} target="_blank" rel="noopener noreferrer" className="ml-1 text-amber-600 underline underline-offset-2">source</a>
            )}
          </span>
        </div>
      ))}
      {comparison.novelFields.length > 0 && (
        <div className="text-xs text-amber-700 mt-1 pt-1 border-t border-amber-100">
          <span className="font-medium">Missing from model:</span>{" "}
          {comparison.novelFields.map((nf) => nf.field).join(", ")}
        </div>
      )}
    </div>
  );
}

function DraftReviewPanel({
  programId,
  stateId,
  allReviews,
  onReviewAdded,
}: {
  programId: string;
  stateId: string;
  allReviews?: DraftReview[];
  onReviewAdded?: () => void;
}) {
  // If allReviews provided (lifted fetch), filter locally. Otherwise fetch independently.
  const [localReviews, setLocalReviews] = useState<DraftReview[]>([]);
  const [status, setStatus] = useState("draft");
  const [comment, setComment] = useState("");
  const [reviewer, setReviewer] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("olera-reviewer") || "";
    return "";
  });
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const fetchReviews = useCallback(async () => {
    if (allReviews) return; // skip if parent provides reviews
    try {
      const res = await fetch(`/api/admin/draft-reviews?state=${stateId}`);
      const data = await res.json();
      if (data.reviews) {
        setLocalReviews(data.reviews.filter((r: DraftReview) => r.program_id === programId));
      }
    } catch { /* silent */ }
  }, [programId, stateId, allReviews]);

  useEffect(() => { fetchReviews(); }, [fetchReviews]);

  const reviews = allReviews
    ? allReviews.filter((r) => r.program_id === programId)
    : localReviews;

  useEffect(() => {
    if (reviews.length > 0) setStatus(reviews[0].status);
  }, [reviews]);

  const submit = async () => {
    if (!reviewer.trim()) return;
    setSubmitting(true);
    // Remember name
    localStorage.setItem("olera-reviewer", reviewer.trim());
    try {
      const res = await fetch("/api/admin/draft-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programId,
          stateId,
          status,
          comment: comment.trim() || undefined,
          reviewedBy: reviewer.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      // Only clear the comment / refresh on confirmed success — a failed
      // POST previously looked identical to success.
      setComment("");
      if (onReviewAdded) onReviewAdded();
      else await fetchReviews();
    } catch (e) {
      toast(`Failed to save review: ${e instanceof Error ? e.message : e}`, { variant: "error" });
    }
    setSubmitting(false);
  };

  const currentStatus = reviews[0]?.status || "draft";
  const statusStyle = STATUSES.find((s) => s.value === currentStatus) || STATUSES[0];

  return (
    <div className="space-y-3">
      {/* Current status */}
      <div className="flex items-center gap-2">
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusStyle.color}`}>
          {statusStyle.label}
        </span>
        {reviews[0] && (
          <span className="text-[11px] text-gray-400">
            by {reviews[0].reviewed_by} · {new Date(reviews[0].created_at).toLocaleDateString()}
          </span>
        )}
      </div>

      {/* Review history */}
      {reviews.length > 0 && (
        <div className="space-y-1.5">
          {reviews.slice(0, 5).map((r) => (
            <div key={r.id} className="flex items-start gap-2 text-xs">
              <span className={`shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full ${
                STATUSES.find((s) => s.value === r.status)?.color.split(" ")[0] || "bg-gray-200"
              }`} />
              <div>
                <span className="font-medium text-gray-600">{r.reviewed_by}</span>
                <span className="text-gray-400"> changed to {r.status}</span>
                {r.comment && <p className="text-gray-500 mt-0.5">{r.comment}</p>}
              </div>
              <span className="text-gray-300 ml-auto shrink-0">
                {new Date(r.created_at).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Add review */}
      <div className="flex items-start gap-2 pt-1">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary-400"
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <input
          type="text"
          value={reviewer}
          onChange={(e) => setReviewer(e.target.value)}
          placeholder="Your name"
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 w-24 focus:outline-none focus:ring-1 focus:ring-primary-400"
        />
        <input
          type="text"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Comment (optional)"
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 flex-1 focus:outline-none focus:ring-1 focus:ring-primary-400"
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <button
          onClick={submit}
          disabled={submitting || !reviewer.trim()}
          className="text-xs font-medium px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-40 transition-colors shrink-0"
        >
          {submitting ? "..." : "Save"}
        </button>
      </div>
    </div>
  );
}

function DraftPreview({ draft, stateId, allReviews, onReviewAdded }: { draft: PipelineDraft; stateId: string; allReviews?: DraftReview[]; onReviewAdded?: () => void }) {
  return (
    <div className="mt-4 p-5 bg-blue-50/40 border border-blue-100 rounded-xl space-y-5">
      {/* Review panel */}
      <DraftReviewPanel programId={draft.id} stateId={stateId} allReviews={allReviews} onReviewAdded={onReviewAdded} />

      {/* Draft header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
            Draft
          </span>
          <span className="text-[11px] text-blue-500">
            {draft.programType} &middot; {draft.complexity} &middot; {draft.draftedAt}
          </span>
        </div>
        {draft.geographicScope && (
          <span className="text-[11px] text-gray-400">
            {draft.geographicScope.type}{draft.geographicScope.stateVariation ? " (state variation)" : ""}
          </span>
        )}
      </div>

      {/* Tagline */}
      <p className="text-sm text-gray-600 italic">{draft.tagline}</p>

      {/* Intro */}
      {draft.intro && (
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Overview</p>
          <div className="text-sm text-gray-700 leading-relaxed space-y-2">
            {draft.intro.split("\n\n").map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        </div>
      )}

      {/* Savings */}
      {draft.savingsRange ? (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-lg">
          <span className="text-sm font-medium text-emerald-700">{draft.savingsRange}</span>
          {draft.savingsSource && <span className="text-[11px] text-emerald-500">&middot; {draft.savingsSource}</span>}
        </div>
      ) : draft.savingsSource ? (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-lg">
          <span className="text-sm text-gray-500">{draft.savingsSource}</span>
        </div>
      ) : null}

      {/* Structured Eligibility */}
      {draft.structuredEligibility && (
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Eligibility</p>
          <ul className="space-y-1">
            {draft.structuredEligibility.summary.map((s, i) => (
              <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                <span className="text-emerald-500 mt-0.5 shrink-0">&#10003;</span>
                {s}
              </li>
            ))}
          </ul>

          {/* Income table */}
          {draft.structuredEligibility.incomeTable && draft.structuredEligibility.incomeTable.length > 0 && (
            <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-3 py-1.5 text-left font-medium text-gray-500">Household Size</th>
                    <th className="px-3 py-1.5 text-left font-medium text-gray-500">Monthly Limit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {draft.structuredEligibility.incomeTable.map((row, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5 text-gray-700">{row.householdSize}</td>
                      <td className="px-3 py-1.5 text-gray-700">${row.monthlyLimit.toLocaleString()}/mo</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Asset limits */}
          {draft.structuredEligibility.assetLimits && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              {draft.structuredEligibility.assetLimits.exemptAssets && draft.structuredEligibility.assetLimits.exemptAssets.length > 0 && (
                <div className="p-2.5 bg-emerald-50/50 rounded-lg">
                  <p className="text-[11px] font-medium text-emerald-600 mb-1">Doesn&apos;t Count</p>
                  <ul className="space-y-0.5">
                    {draft.structuredEligibility.assetLimits.exemptAssets.map((a, i) => (
                      <li key={i} className="text-xs text-gray-600">{a}</li>
                    ))}
                  </ul>
                </div>
              )}
              {draft.structuredEligibility.assetLimits.countedAssets && draft.structuredEligibility.assetLimits.countedAssets.length > 0 && (
                <div className="p-2.5 bg-amber-50/50 rounded-lg">
                  <p className="text-[11px] font-medium text-amber-600 mb-1">Counts Against Limit</p>
                  <ul className="space-y-0.5">
                    {draft.structuredEligibility.assetLimits.countedAssets.map((a, i) => (
                      <li key={i} className="text-xs text-gray-600">{a}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Functional requirement */}
          {draft.structuredEligibility.functionalRequirement && (
            <p className="mt-2 text-xs text-gray-500 bg-gray-50 p-2.5 rounded-lg">
              {draft.structuredEligibility.functionalRequirement}
            </p>
          )}
        </div>
      )}

      {/* Application Guide */}
      {draft.applicationGuide && (
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">How to Apply</p>
          <p className="text-sm text-gray-700 mb-2">{draft.applicationGuide.summary}</p>

          {draft.applicationGuide.steps && draft.applicationGuide.steps.length > 0 && (
            <ol className="space-y-2">
              {draft.applicationGuide.steps.map((step) => (
                <li key={step.step} className="text-sm text-gray-700 flex items-start gap-2.5">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-[11px] font-semibold text-blue-600 shrink-0 mt-0.5">
                    {step.step}
                  </span>
                  <div>
                    <span className="font-medium text-gray-900">{step.title}</span>
                    <span className="text-gray-500"> — {step.description}</span>
                  </div>
                </li>
              ))}
            </ol>
          )}

          <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-400">
            {draft.applicationGuide.processingTime && (
              <span>Processing: {draft.applicationGuide.processingTime}</span>
            )}
            {draft.applicationGuide.waitlist && (
              <span className="text-amber-500">Waitlist: {draft.applicationGuide.waitlist}</span>
            )}
          </div>

          {draft.applicationGuide.tip && (
            <p className="mt-2 text-xs text-blue-600 bg-blue-50 p-2.5 rounded-lg">
              Tip: {draft.applicationGuide.tip}
            </p>
          )}
        </div>
      )}

      {/* Content Sections */}
      {draft.contentSections && draft.contentSections.length > 0 && (
        <div className="space-y-3">
          {draft.contentSections.map((section, i) => {
            if (section.type === "callout" && "text" in section) {
              const toneColors: Record<string, string> = {
                warning: "bg-amber-50 border-amber-100 text-amber-700",
                tip: "bg-blue-50 border-blue-100 text-blue-700",
                info: "bg-gray-50 border-gray-200 text-gray-600",
              };
              const tone = String("tone" in section ? section.tone : "info");
              return (
                <div key={i} className={`text-xs p-2.5 rounded-lg border ${toneColors[tone] || toneColors.info}`}>
                  {String(section.text)}
                </div>
              );
            }
            if (section.type === "tier-comparison" && "tiers" in section) {
              const tiers = section.tiers as { name: string; description: string; incomeLimit?: string; coverage?: string }[];
              return (
                <div key={i}>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                    {(section as { heading?: string }).heading || "Program Tiers"}
                  </p>
                  <div className="grid gap-2">
                    {tiers.map((tier, j) => (
                      <div key={j} className="p-2.5 bg-white rounded-lg border border-gray-100">
                        <p className="text-sm font-medium text-gray-900">{tier.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{tier.description}</p>
                        {tier.incomeLimit && <p className="text-xs text-gray-400 mt-0.5">Income: {tier.incomeLimit}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
            if (section.type === "documents" && "categories" in section) {
              const cats = section.categories as { name: string; items: string[] }[];
              return (
                <div key={i}>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                    {(section as { heading?: string }).heading || "Documents Needed"}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {cats.map((cat, j) => (
                      <div key={j} className="p-2.5 bg-white rounded-lg border border-gray-100">
                        <p className="text-xs font-medium text-gray-700 mb-1">{cat.name}</p>
                        <ul className="space-y-0.5">
                          {cat.items.map((item, k) => (
                            <li key={k} className="text-xs text-gray-500">&#8226; {item}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
            return null;
          })}
        </div>
      )}

      {/* FAQs */}
      {draft.faqs && draft.faqs.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">FAQs ({draft.faqs.length})</p>
          <div className="space-y-2">
            {draft.faqs.map((faq, i) => (
              <details key={i} className="group">
                <summary className="text-sm text-gray-700 font-medium cursor-pointer hover:text-gray-900 list-none flex items-start gap-2">
                  <svg className="w-3.5 h-3.5 text-gray-400 mt-1 shrink-0 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  {faq.question}
                </summary>
                <p className="text-sm text-gray-500 leading-relaxed mt-1.5 ml-[22px]">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      )}

      {/* Source + phone */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 pt-2 border-t border-blue-100 text-xs text-gray-400">
        {draft.sourceUrl && (
          <a href={draft.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600 underline underline-offset-2">
            Official source &#8599;
          </a>
        )}
        {draft.phone && <span>Phone: {draft.phone}</span>}
      </div>
    </div>
  );
}

// ─── Review Guide ──────────────────────────────────────────────────────────
// Collapsible checklist shown in the admin dashboard to help reviewers spot-
// check content. Two variants: "state" (cross-program review) and "program"
// (factual precision on one program). Uses native <details> — no state, no
// localStorage, zero height when collapsed. Intended to be quiet guidance
// available when wanted, invisible when not.

function ReviewGuide({ variant }: { variant: "state" | "program" }) {
  const intro = variant === "state"
    ? "Before approving this state, verify:"
    : "For this program, verify:";

  const items = variant === "state"
    ? [
        { label: "Intro tone", body: "Read the first paragraph. Does it sound like a thoughtful guide or a government pamphlet?" },
        { label: "Where to start picks", body: "Do the 3–4 featured programs match what a caregiver would actually want first — not a bureaucratic top-down list?" },
        { label: "Cross-program consistency", body: "Do age and income thresholds line up across related programs (Medicaid + MSP, SNAP + LIHEAP)?" },
        { label: "Factcheck flags", body: "Open data/pipeline/FACTCHECK_TRIAGE_2026-04-14.md and scan for this state. Any high-severity flag needs eyes before approve." },
        { label: "Sample one program deeply", body: "Expand any program row below and follow its spot-check guide." },
      ]
    : [
        { label: "Age is the senior threshold", body: "If the program serves multiple populations (kids + elderly, or any-adult disability + senior pathway), confirm the draft captures the senior threshold (55/60/65), not a compound-program floor age." },
        { label: "Income and asset limits are current", body: "Click the .gov source URL in the application guide and confirm the dollar amounts match what's on the state's page." },
        { label: "Phone connects", body: "Dial one number from the program. Does it reach the right office? Hours match?" },
        { label: "Application URL works", body: "Click through to the linked application page. Is it active, current, and the right program?" },
        { label: "FAQs are decision-making, not definitional", body: "Good: \"Can my parent keep their house if assets are over $2,000?\" Bad: \"What is SNAP?\" The intro already explains what the program is." },
      ];

  return (
    <details className="group">
      <summary className="inline-flex items-center gap-2 cursor-pointer select-none list-none px-3 py-2 rounded-lg bg-vanilla-50 border border-vanilla-200 hover:border-amber-200 hover:bg-vanilla-100 transition-colors">
        <svg
          className="w-3.5 h-3.5 text-amber-600 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-xs font-semibold text-gray-700">How to review this {variant}</span>
        <svg
          className="w-3 h-3 text-gray-400 transition-transform group-open:rotate-90 ml-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
      </summary>
      <div className="mt-3 p-4 rounded-lg bg-vanilla-50 border border-vanilla-200">
        <p className="text-xs font-medium text-gray-700 mb-3">{intro}</p>
        <ol className="space-y-2.5">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2.5 text-xs text-gray-600 leading-relaxed">
              <span className="flex-shrink-0 w-4 h-4 rounded-full bg-white border border-gray-300 text-[10px] font-semibold text-gray-500 flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <span>
                <span className="font-semibold text-gray-700">{item.label}</span>
                {" — "}
                {item.body}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
}

function ProgramPreview({ program, stateId, pipelineComparison, draft, allReviews, onReviewAdded }: { program: WaiverProgram; stateId: string; pipelineComparison?: PipelineComparison; draft?: PipelineDraft; allReviews?: DraftReview[]; onReviewAdded?: () => void }) {
  const [showDraft, setShowDraft] = useState(draft ? true : false);

  return (
    <div className="mt-4 pt-4 border-t border-gray-100 space-y-5">
      {/* Spot-check guide — collapsed by default */}
      <ReviewGuide variant="program" />

      {/* Draft toggle + preview */}
      {draft && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowDraft(true)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                showDraft ? "bg-blue-100 text-blue-700" : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              Draft Content
            </button>
            <button
              onClick={() => setShowDraft(false)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                !showDraft ? "bg-gray-200 text-gray-700" : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              Current Content
            </button>
          </div>
          <a
            href={`/senior-benefits/${stateId}/${program.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Preview
          </a>
        </div>
      )}

      {/* Draft preview */}
      {showDraft && draft ? (
        <DraftPreview draft={draft} stateId={stateId} allReviews={allReviews} onReviewAdded={onReviewAdded} />
      ) : (
        <>
          {/* Pipeline diffs */}
          {pipelineComparison && (pipelineComparison.diffs.length > 0 || pipelineComparison.novelFields.length > 0) && (
            <PipelineDiffs comparison={pipelineComparison} />
          )}

          {/* Description */}
          {program.intro && (
            <div>
              <p className="text-[13px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">Overview</p>
              <p className="text-sm text-gray-700 leading-relaxed">{program.intro}</p>
            </div>
          )}

          {/* Eligibility */}
          {program.eligibilityHighlights.length > 0 && (
            <div>
              <p className="text-[13px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">Eligibility</p>
              <ul className="space-y-1">
                {program.eligibilityHighlights.map((h, i) => (
                  <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                    <span className="text-emerald-500 mt-0.5 shrink-0">&#10003;</span>
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Application Steps */}
          {program.applicationSteps.length > 0 && (
            <div>
              <p className="text-[13px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">How to Apply</p>
              <ol className="space-y-2">
                {program.applicationSteps.map((step) => (
                  <li key={step.step} className="text-sm text-gray-700 flex items-start gap-2.5">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-500 shrink-0 mt-0.5">
                      {step.step}
                    </span>
                    <div>
                      <span className="font-medium text-gray-900">{step.title}</span>
                      <span className="text-gray-500"> — {step.description}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Links & verification metadata */}
          <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2 border-t border-gray-50">
            <a
              href={`/senior-benefits/${stateId}/${program.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-gray-900 hover:text-primary-700 underline underline-offset-2 decoration-gray-300"
            >
              View live page &#8599;
            </a>
            {program.sourceUrl && (
              <a
                href={program.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary-600 hover:text-primary-700 underline underline-offset-2 decoration-primary-200"
              >
                Official source &#8599;
              </a>
            )}
            {program.lastVerifiedDate && (
              <span className="text-xs text-gray-400">
                Verified {program.lastVerifiedDate} by {program.verifiedBy}
              </span>
            )}
            {program.savingsSource && (
              <span className="text-xs text-gray-400">
                Savings: {program.savingsSource}
              </span>
            )}
            {program.phone && (
              <span className="text-xs text-gray-400">
                Phone: {program.phone}
              </span>
            )}
          </div>

          {/* FAQs */}
          {program.faqs && program.faqs.length > 0 && (
            <div>
              <p className="text-[13px] font-medium text-gray-400 uppercase tracking-wider mb-2">FAQs ({program.faqs.length})</p>
              <div className="space-y-2">
                {program.faqs.map((faq, i) => (
                  <details key={i} className="group">
                    <summary className="text-sm text-gray-700 font-medium cursor-pointer hover:text-gray-900 list-none flex items-start gap-2">
                      <svg className="w-3.5 h-3.5 text-gray-400 mt-1 shrink-0 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      {faq.question}
                    </summary>
                    <p className="text-sm text-gray-500 leading-relaxed mt-1.5 ml-[22px]">{faq.answer}</p>
                  </details>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ProgramRow({ program, stateId, pipelineComparison, draft, reviewStatus, allReviews, onReviewAdded }: { program: WaiverProgram; stateId: string; pipelineComparison?: PipelineComparison; draft?: PipelineDraft; reviewStatus?: string; allReviews?: DraftReview[]; onReviewAdded?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const type = getProgramType(program);

  // Review status badge
  const statusInfo = reviewStatus ? STATUSES.find((s) => s.value === reviewStatus) : null;

  // Determine what versions exist
  const hasV2 = !!draft || !!program.programType; // Pipeline draft or hand-enriched
  const hasCurrent = true; // All programs have a current page in waiver-library

  return (
    <div
      className={`px-5 py-3.5 transition-colors ${
        expanded ? "bg-gray-50/50" : "hover:bg-gray-50/50"
      }`}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 flex items-center gap-3 text-left min-w-0"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-900 truncate">
                {program.name}
              </span>
              <TypeBadge type={type} />
              {statusInfo && (
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusInfo.color}`}>
                  {statusInfo.label}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              {program.savingsRange ? (
                <span className="text-xs text-emerald-600 font-medium">{program.savingsRange}</span>
              ) : (
                <span className="text-xs text-gray-400">Free service</span>
              )}
            </div>
          </div>
          <svg
            className={`w-4 h-4 text-gray-300 shrink-0 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Preview links — top right of each program row */}
        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          {hasV2 ? (
            <>
              <a
                href={`/senior-benefits/${stateId}/${program.id}/current`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 px-2 py-1 rounded transition-colors"
              >
                Preview current
              </a>
              <a
                href={`/senior-benefits/${stateId}/${program.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-2 py-1 rounded transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Preview v2
              </a>
            </>
          ) : (
            <>
              <a
                href={`/senior-benefits/${stateId}/${program.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 px-2 py-1 rounded transition-colors"
              >
                Preview current
              </a>
              <span className="text-[10px] text-gray-300">No v2</span>
            </>
          )}
        </div>
      </div>
      {expanded && <ProgramPreview program={program} stateId={stateId} pipelineComparison={pipelineComparison} draft={draft} allReviews={allReviews} onReviewAdded={onReviewAdded} />}
    </div>
  );
}

// ─── State Grid Card ────────────────────────────────────────────────────────

const READINESS_STYLES: Record<StateReadiness, { border: string; dot: string; label: string }> = {
  published: { border: "border-emerald-200 hover:border-emerald-300", dot: "bg-emerald-400", label: "Published" },
  drafted: { border: "border-blue-200 hover:border-blue-300", dot: "bg-blue-400", label: "Drafts Ready" },
  explored: { border: "border-amber-200 hover:border-amber-300", dot: "bg-amber-400", label: "Explored" },
  scaffolding: { border: "border-gray-200 hover:border-gray-300", dot: "bg-gray-200", label: "" },
};

function StateCard({
  state,
  onClick,
}: {
  state: StateData;
  onClick: () => void;
}) {
  const readiness = getStateReadiness(state);
  const style = READINESS_STYLES[readiness];
  const pipeline = pipelineData[state.abbreviation] as PipelineStateSummary | undefined;
  const drafts = pipelineDrafts[state.abbreviation];
  const draftCount = drafts?.programs?.length || 0;

  return (
    <button
      onClick={onClick}
      className={`text-left p-4 rounded-xl border bg-white hover:shadow-sm transition-all duration-150 group ${style.border}`}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${style.dot}`} />
          <span className="text-sm font-semibold text-gray-900">
            {state.abbreviation}
          </span>
        </div>
        <span className="text-[11px] text-gray-400">{state.programs.length}</span>
      </div>
      <p className="text-[13px] text-gray-500 truncate">
        {state.name}
      </p>
      {readiness !== "scaffolding" && (
        <p className="text-[11px] mt-2 font-medium" style={{ color: readiness === "published" ? "#059669" : readiness === "drafted" ? "#3b82f6" : "#d97706" }}>
          {readiness === "published" && `${state.programs.filter(p => p.lastVerifiedDate).length} verified`}
          {readiness === "drafted" && `${draftCount} drafts`}
          {readiness === "explored" && "Explored"}
        </p>
      )}
    </button>
  );
}

// ─── State Detail View ──────────────────────────────────────────────────────

function StateOverviewPreview({ overview, stateName }: { overview: PipelineStateOverview; stateName: string }) {
  return (
    <div className="space-y-5">
      {/* Intro */}
      <div>
        <p className="text-[13px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">Intro</p>
        <div className="text-sm text-gray-700 leading-relaxed space-y-2">
          {overview.intro.split("\n\n").map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      </div>

      {/* Start here */}
      {overview.startHere.length > 0 && (
        <div>
          <p className="text-[13px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">Where to Start ({overview.startHere.length} picks)</p>
          <div className="space-y-2">
            {overview.startHere.map((pick, i) => (
              <div key={i} className="flex items-start gap-2.5 text-sm">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[11px] font-semibold shrink-0 mt-0.5">{i + 1}</span>
                <div>
                  <span className="font-medium text-gray-900">{pick.name}</span>
                  <span className="text-gray-500"> — {pick.why}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* By need */}
      {overview.byNeed.length > 0 && (
        <div>
          <p className="text-[13px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">Browse by Need ({overview.byNeed.length} groups)</p>
          <div className="space-y-3">
            {overview.byNeed.map((group, i) => (
              <div key={i} className="text-sm">
                <p className="font-medium text-gray-900">{group.need}</p>
                <p className="text-gray-500 mt-0.5">{group.description}</p>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {group.programs.map((name, j) => (
                    <span key={j} className="text-xs bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full">{name}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick facts */}
      {overview.quickFacts.length > 0 && (
        <div>
          <p className="text-[13px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">Quick Facts</p>
          <ul className="space-y-1.5">
            {overview.quickFacts.map((fact, i) => (
              <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                <span className="text-gray-400 mt-0.5 shrink-0">&#8226;</span>
                {fact}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Resources vs Benefits */}
      {overview.resourcesVsBenefits && (
        <div>
          <p className="text-[13px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">Resources vs Benefits</p>
          <p className="text-sm text-gray-700 leading-relaxed">{overview.resourcesVsBenefits}</p>
        </div>
      )}
    </div>
  );
}

function StateDetail({
  state,
  onBack,
}: {
  state: StateData;
  onBack: () => void;
}) {
  const stats = getVerificationStats(state.programs);
  const pipeline = pipelineData[state.abbreviation];
  const comparisons = pipeline?.comparisons || [];
  const stateDrafts = pipelineDrafts[state.abbreviation]?.programs || [];
  const stateOverview = pipelineDrafts[state.abbreviation]?.stateOverview;
  const [showStateOverview, setShowStateOverview] = useState(false);

  // Lift review fetch — one API call for entire state
  const [allReviews, setAllReviews] = useState<DraftReview[]>([]);
  const fetchAllReviews = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/draft-reviews?state=${state.abbreviation}`);
      const data = await res.json();
      if (data.reviews) setAllReviews(data.reviews);
    } catch { /* silent */ }
  }, [state.abbreviation]);
  useEffect(() => { fetchAllReviews(); }, [fetchAllReviews]);

  // Get review status for a program
  function getReviewStatus(programId: string): string | undefined {
    const review = allReviews.find((r) => r.program_id === programId);
    return review?.status;
  }

  // Match pipeline comparisons to existing programs by ID or fuzzy name
  function findComparison(program: WaiverProgram): PipelineComparison | undefined {
    return comparisons.find((c) =>
      c.existingId === program.id ||
      c.name.toLowerCase().includes(program.name.toLowerCase().slice(0, 20)) ||
      program.name.toLowerCase().includes(c.name.toLowerCase().slice(0, 20))
    );
  }

  function findDraft(program: WaiverProgram): PipelineDraft | undefined {
    return stateDrafts.find((d) =>
      d.name.toLowerCase().includes(program.name.toLowerCase().slice(0, 20)) ||
      program.name.toLowerCase().includes(d.name.toLowerCase().slice(0, 20))
    );
  }

  return (
    <div>
      {/* Compact header — state name, counts, preview links, all in one line */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors shrink-0"
            aria-label="All states"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 leading-snug">{state.name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {stats.total} programs
              {stateDrafts.length > 0 && <> &middot; <span className="text-blue-500">{stateDrafts.length} drafted</span></>}
              {stats.verified > 0 && <> &middot; <span className="text-emerald-500">{stats.verified} verified</span></>}
              {pipeline?.diffsFound ? <> &middot; <span className="text-amber-500">{pipeline.diffsFound} issues</span></> : null}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {stateOverview && (
            <a
              href={`/senior-benefits/${state.id}/current`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 px-2.5 py-1.5 rounded-lg transition-colors"
            >
              Preview current
            </a>
          )}
          <a
            href={`/senior-benefits/${state.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-2.5 py-1.5 rounded-lg transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {stateOverview ? "Preview v2" : "Preview page"}
          </a>
        </div>
      </div>

      {/* Spot-check guide — collapsed by default */}
      <div className="mb-5">
        <ReviewGuide variant="state" />
      </div>

      {/* State overview — collapsed by default, inline disclosure */}
      {stateOverview && (
        <div className="mb-5">
          <button
            onClick={() => setShowStateOverview(!showStateOverview)}
            className="w-full flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-gray-200 hover:border-gray-300 transition-colors group"
          >
            <span className="text-sm font-medium text-gray-700">State overview draft</span>
            <div className="flex items-center gap-2">
              {!showStateOverview && (
                <span className="text-xs text-gray-400">Click to expand</span>
              )}
              <svg
                className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${showStateOverview ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>

          {showStateOverview && (
            <div className="mt-2 p-4 bg-white rounded-xl border border-gray-200 space-y-5">
              <StateOverviewPreview overview={stateOverview} stateName={state.name} />
              <div className="pt-4 border-t border-gray-100">
                <DraftReviewPanel programId="state-overview" stateId={state.abbreviation} allReviews={allReviews} onReviewAdded={fetchAllReviews} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Program list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
        {state.programs.map((program) => {
          const draft = findDraft(program);
          return (
            <ProgramRow
              key={program.id}
              program={program}
              stateId={state.id}
              pipelineComparison={findComparison(program)}
              draft={draft}
              reviewStatus={draft ? getReviewStatus(draft.id) : undefined}
              allReviews={allReviews}
              onReviewAdded={fetchAllReviews}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

type ReadinessFilter = "all" | "published" | "drafted" | "explored" | "scaffolding";

export default function AdminBenefitsPage() {
  // Families is the primary view — the content-ops CMS is demoted to a
  // secondary tab (mostly used during pipeline/review pushes).
  const [view, setView] = useState<"families" | "content">("families");
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [readinessFilter, setReadinessFilter] = useState<ReadinessFilter>("all");

  // Browser back button support: push history when selecting, pop clears selection
  const selectState = useCallback((abbr: string | null) => {
    if (abbr) window.history.pushState({ view: "state", abbr }, "");
    setSelectedState(abbr);
    setSelectedRegion(null);
  }, []);
  const selectRegion = useCallback((key: string | null) => {
    if (key) window.history.pushState({ view: "region", key }, "");
    setSelectedRegion(key);
    setSelectedState(null);
  }, []);
  useEffect(() => {
    const onPop = () => { setSelectedState(null); setSelectedRegion(null); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stateParam = params.get("state");
    if (stateParam && allStates.some((s) => s.abbreviation === stateParam.toUpperCase())) {
      setSelectedState(stateParam.toUpperCase());
      setView("content");
    }
    if (params.get("view") === "content") setView("content");
  }, []);

  const globalStats = useMemo(() => {
    const allPrograms = allStates.flatMap((s) => s.programs);
    const totalPrograms = allPrograms.length;

    // Pipeline stats
    const pipelineStates = Object.keys(pipelineData);
    const exploredCount = pipelineStates.length;

    // Draft stats across all states
    let totalDrafts = 0;
    for (const stateCode of Object.keys(pipelineDrafts)) {
      totalDrafts += pipelineDrafts[stateCode]?.programs?.length || 0;
    }

    // Readiness breakdown
    const readiness = { published: 0, drafted: 0, explored: 0, scaffolding: 0 };
    for (const s of allStates) {
      readiness[getStateReadiness(s)]++;
    }

    return { totalPrograms, exploredCount, totalDrafts, readiness };
  }, []);

  const filteredStates = useMemo(() => {
    let states = [...allStates];

    // Search
    if (search) {
      const q = search.toLowerCase();
      states = states.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.abbreviation.toLowerCase().includes(q)
      );
    }

    // Readiness filter
    if (readinessFilter !== "all") {
      states = states.filter((s) => getStateReadiness(s) === readinessFilter);
    }

    // Sort: published first, then drafted, explored, scaffolding
    const order: Record<StateReadiness, number> = { published: 0, drafted: 1, explored: 2, scaffolding: 3 };
    states.sort((a, b) => order[getStateReadiness(a)] - order[getStateReadiness(b)]);

    return states;
  }, [search, readinessFilter]);

  // Regions from pipeline-drafts
  const regions = useMemo(() => {
    return Object.entries(pipelineDrafts)
      .filter(([, d]) => d.isRegion)
      .map(([key, d]) => ({
        key,
        name: d.regionName || key,
        slug: d.slug || key,
        parentState: d.parentState,
        programCount: d.programs.length,
        draftedAt: d.draftedAt,
        hasOverview: !!d.stateOverview,
      }));
  }, []);

  const stateData = selectedState
    ? allStates.find((s) => s.abbreviation === selectedState)
    : null;

  const regionData = selectedRegion
    ? pipelineDrafts[selectedRegion]
    : null;

  // Counts per readiness for filter pills
  const readinessCounts = useMemo(() => {
    const counts = { all: allStates.length, published: 0, drafted: 0, explored: 0, scaffolding: 0 };
    for (const s of allStates) {
      counts[getStateReadiness(s)]++;
    }
    return counts;
  }, []);

  // Split states into active (published/drafted/explored) and backlog (scaffolding)
  const activeStates = useMemo(() =>
    filteredStates.filter((s) => getStateReadiness(s) !== "scaffolding"),
  [filteredStates]);
  const backlogStates = useMemo(() =>
    filteredStates.filter((s) => getStateReadiness(s) === "scaffolding"),
  [filteredStates]);

  return (
    <div>
      {/* Header — serif title + view toggle */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-4">
            <h1 className="text-display-xs font-bold text-gray-900 font-serif">Benefits</h1>
            <Link href="/admin/benefits/study" className="text-sm text-gray-500 underline underline-offset-2 hover:text-gray-800">CARE-NAV study</Link>
          </div>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setView("families")}
              className={`px-3.5 py-1.5 text-xs font-medium transition-colors ${
                view === "families" ? "bg-gray-900 text-white" : "bg-white text-gray-500 hover:bg-gray-50"
              }`}
            >
              Families
            </button>
            <button
              onClick={() => setView("content")}
              className={`px-3.5 py-1.5 text-xs font-medium transition-colors ${
                view === "content" ? "bg-gray-900 text-white" : "bg-white text-gray-500 hover:bg-gray-50"
              }`}
            >
              Content
            </button>
          </div>
        </div>
        {view === "content" && (
        <>
        <p className="text-sm text-gray-500 mt-1">
          {globalStats.readiness.drafted > 0 && (
            <><span className="font-medium text-gray-700">{globalStats.readiness.drafted}</span> drafted</>
          )}
          {globalStats.readiness.published > 0 && (
            <> &middot; <span className="font-medium text-gray-700">{globalStats.readiness.published}</span> published</>
          )}
          {globalStats.readiness.explored > 0 && (
            <> &middot; <span className="font-medium text-gray-700">{globalStats.readiness.explored}</span> explored</>
          )}
          {globalStats.readiness.scaffolding > 0 && (
            <> &middot; <span className="text-gray-400">{globalStats.readiness.scaffolding} awaiting pipeline</span></>
          )}
          <> &middot; {globalStats.totalDrafts} program drafts &middot; {globalStats.totalPrograms.toLocaleString()} programs total</>
        </p>

        {/* Readiness bar */}
        <div className="flex gap-0.5 mt-3 h-2 rounded-full overflow-hidden bg-gray-100 max-w-lg">
          {globalStats.readiness.published > 0 && (
            <div className="bg-emerald-400 transition-all" style={{ width: `${(globalStats.readiness.published / allStates.length) * 100}%` }} />
          )}
          {globalStats.readiness.drafted > 0 && (
            <div className="bg-blue-400 transition-all" style={{ width: `${(globalStats.readiness.drafted / allStates.length) * 100}%` }} />
          )}
          {globalStats.readiness.explored > 0 && (
            <div className="bg-amber-400 transition-all" style={{ width: `${(globalStats.readiness.explored / allStates.length) * 100}%` }} />
          )}
        </div>
        </>
        )}
      </div>

      {view === "families" ? (
        <BenefitsFamiliesView />
      ) : stateData ? (
        <StateDetail
          state={stateData}
          onBack={() => window.history.back()}
        />
      ) : selectedRegion && regionData ? (
        <div>
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-4"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
            </svg>
            All regions
          </button>
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">{regionData.regionName || selectedRegion}</h2>
              <div className="flex items-center gap-2">
                {regionData.slug && (
                  <a
                    href={`/benefits/${regionData.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Preview page
                  </a>
                )}
              </div>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {regionData.programs.length} programs &middot; {regionData.parentState ? `Parent: ${regionData.parentState}` : "Multi-state"} &middot; Drafted {regionData.draftedAt}
            </p>
          </div>

          {/* Region overview */}
          {regionData.stateOverview && (
            <div className="mb-4 p-4 bg-white rounded-xl border border-gray-200 space-y-5">
              <StateOverviewPreview overview={regionData.stateOverview} stateName={regionData.regionName || selectedRegion} />
              <div className="pt-4 border-t border-gray-100">
                <p className="text-[13px] font-medium text-gray-400 uppercase tracking-wider mb-2">Review</p>
                <DraftReviewPanel programId="state-overview" stateId={selectedRegion} />
              </div>
            </div>
          )}

          {/* Region programs */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
            {regionData.programs.map((draft) => (
              <div key={draft.id} className="px-5 py-3.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-900">{draft.name}</span>
                  <TypeBadge type={draft.programType || "benefit"} />
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{draft.tagline}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Search */}
          <div className="mb-5">
            <div className="relative max-w-xs">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search states..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-colors"
              />
            </div>
          </div>

          {/* Active states — the ones that matter */}
          {activeStates.length > 0 && (
            <div className="mb-8">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-3">
                Active ({activeStates.length})
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {activeStates.map((state) => (
                  <StateCard
                    key={state.abbreviation}
                    state={state}
                    onClick={() => selectState(state.abbreviation)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Regions */}
          {regions.length > 0 && (
            <div className="mb-8">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-3">
                Regions ({regions.length})
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {regions.map((region) => (
                  <button
                    key={region.key}
                    onClick={() => selectRegion(region.key)}
                    className="text-left p-4 rounded-xl border border-blue-200 hover:border-blue-300 bg-white hover:shadow-sm transition-all duration-150 group"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2 h-2 rounded-full bg-blue-400" />
                      <span className="text-sm font-semibold text-gray-900">{region.name}</span>
                    </div>
                    <p className="text-[11px] text-gray-400">
                      {region.programCount} programs{region.parentState ? ` · ${region.parentState}` : ""}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Backlog states — compressed */}
          {backlogStates.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-3">
                Awaiting pipeline ({backlogStates.length})
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-1.5">
                {backlogStates.map((state) => (
                  <button
                    key={state.abbreviation}
                    onClick={() => selectState(state.abbreviation)}
                    className="text-left px-3 py-2 rounded-lg border border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-xs font-semibold text-gray-500">{state.abbreviation}</span>
                    <span className="text-[11px] text-gray-400 ml-1.5">{state.programs.length}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {filteredStates.length === 0 && (
            <div className="text-center py-16">
              <p className="text-sm text-gray-400">No states match your search</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

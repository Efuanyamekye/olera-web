"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import type {
  WaiverProgram,
  StateData,
  ContentSection,
  ApplicationGuide,
  StructuredEligibility,
} from "@/data/waiver-library";
import { ServiceAreasMap } from "@/components/waiver-library/ServiceAreasMapLoader";
import { CityBadge } from "@/components/waiver-library/CityBadge";
import { useSavedPrograms } from "@/hooks/use-saved-programs";
import { Vault, Phone, Info, CaretDown, CaretLeft, ArrowSquareOut, BookmarkSimple, CheckCircle, FileText, Clock, HourglassHigh, MapPin, ArrowsClockwise, Globe, ShareNetwork, Printer, Check, Stethoscope, House as HouseIcon, Wheelchair, Tooth, Eye, Car, FirstAid, Pill, HandCoins, Wrench, Users, Heart } from "@phosphor-icons/react";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { ProgramIcon } from "@/lib/program-icon";
import { getDisplayName } from "@/lib/program-name";
import { ContentStatusBadge } from "@/components/waiver-library/ContentStatusBadge";
import { ReviewerAvatar } from "@/components/waiver-library/ReviewerAvatar";
import { getProgramVerifier, getProgramPublisher, getStateReviewedAt } from "@/data/benefits-verifiers";
import { formatReviewDate } from "@/lib/format-review-date";
import { matchesCareNeed, type CareNeed } from "@/lib/benefits/match-care-need";
import ProgramBenefitsCard, { type BenefitsProgram } from "@/components/waiver-library/ProgramBenefitsCard";
import ProgramBenefitsMobileCTA from "@/components/waiver-library/ProgramBenefitsMobileCTA";
import { useProgramCardFlow } from "@/hooks/use-program-card-flow";
import { pickCallContact } from "@/lib/benefits/call-script";
import { getOrCreateSessionId } from "@/lib/analytics/session";
import { trackBenefitsEvent } from "@/lib/analytics/track-step";

// Pre-derive the care need from the program the user is reading. Landing on
// a specific program IS the care signal, so the conversion card skips the
// "what do you need help with?" step entirely. Order is most-specific first;
// payingForCare is the catch-all (most benefit programs are financial).
function deriveProgramCareNeed(program: WaiverProgram): CareNeed {
  const probe = { name: program.name, shortName: program.shortName, tagline: program.tagline };
  const order: CareNeed[] = ["stayingAtHome", "memoryHealth", "companionship", "payingForCare"];
  for (const cn of order) {
    if (matchesCareNeed(probe, cn)) return cn;
  }
  return "payingForCare";
}

// ═══════════════════════════════════════════════════════════════════════════════
// Design atoms — shared visual vocabulary from the state page, adapted
// for program-level depth. The state page paints with bold strokes (full-width
// dark bands, organic blobs). The program page uses the same palette but with
// more restraint — accent lines, quieter illustrations, precise moments.
// ═══════════════════════════════════════════════════════════════════════════════

// --- Organic SVG elements ---

function HeaderAccent() {
  return (
    <svg
      className="absolute right-0 top-0 h-full w-1/3 opacity-[0.08] pointer-events-none"
      viewBox="0 0 300 200"
      fill="none"
      aria-hidden="true"
    >
      {/* Soft teal shape — atmospheric, not literal */}
      <path
        d="M200 30c40 10 80 50 75 95s-55 65-100 75-80-10-95-50S160 20 200 30Z"
        fill="#96c8c8"
      />
      {/* Warm accent dot */}
      <circle cx="260" cy="60" r="12" fill="#e9bd91" opacity="0.5" />
      {/* Tiny floating dots */}
      <circle cx="240" cy="140" r="4" fill="#96c8c8" opacity="0.4" />
      <circle cx="255" cy="155" r="2.5" fill="#e9bd91" opacity="0.3" />
    </svg>
  );
}

function WavyDivider({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`w-full h-5 text-primary-200/30 ${className}`}
      viewBox="0 0 1200 20"
      preserveAspectRatio="none"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M0 10c100-6 200 6 300 0s200-6 300 0 200 6 300 0 200-6 300 0"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function HandDrawnUnderline() {
  return (
    <svg
      className="absolute -bottom-1.5 left-0 w-full h-2.5 text-primary-300/50"
      viewBox="0 0 200 10"
      preserveAspectRatio="none"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2 7c30-3 60-5 100-4s70 2 96 1"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

// --- Typography atoms ---

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-gray-500 mb-3">
      {children}
    </p>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-2xl md:text-3xl font-bold text-gray-900 font-serif leading-snug mb-1">
      {children}
    </h2>
  );
}

// --- Badge atoms ---

function TypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    benefit: "bg-emerald-50 text-emerald-600",
    resource: "bg-blue-50 text-blue-600",
    navigator: "bg-violet-50 text-violet-600",
    employment: "bg-amber-50 text-amber-600",
  };
  return (
    <span className={`text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full ${styles[type] || "bg-gray-100 text-gray-500"}`}>
      {type}
    </span>
  );
}

function ScopeBadge({ scope }: { scope: string }) {
  return (
    <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide px-2.5 py-1 rounded-full border border-gray-200">
      {scope}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Reusable components — these are the building blocks the pipeline selects from.
// Each component is self-contained and renders well at any width.
// ═══════════════════════════════════════════════════════════════════════════════

// --- Stat Callout (the "bold moment" for program pages) ---

function StatCallout({ stats }: { stats: { value: string; label: string }[] }) {
  if (stats.length === 0) return null;
  return (
    <div className="bg-gray-900 rounded-2xl py-8 px-8 md:px-10">
      <div className="flex flex-wrap items-baseline gap-x-10 gap-y-4">
        {stats.map((stat, i) => (
          <div key={i}>
            <span className="text-display-xs md:text-display-sm font-bold text-white font-serif">
              {stat.value}
            </span>
            <span className="text-gray-400 text-base ml-2">{stat.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Income Table ---

function IncomeTable({
  rows,
  heading,
  footnote,
  highlightRow,
}: {
  rows: { householdSize: number; monthlyLimit: number }[];
  heading?: string;
  footnote?: string;
  highlightRow?: number;
}) {
  return (
    <div>
      {heading && (
        <p className="text-sm font-medium text-gray-900 mb-3">{heading}</p>
      )}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-5 py-3 text-left font-medium text-gray-500 text-[11px] uppercase tracking-wide">
                Household size
              </th>
              <th className="px-5 py-3 text-left font-medium text-gray-500 text-[11px] uppercase tracking-wide">
                Monthly income limit
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, i) => {
              const isHighlighted = highlightRow === row.householdSize;
              return (
                <tr
                  key={i}
                  className={isHighlighted ? "bg-primary-50/40" : ""}
                >
                  <td className="px-5 py-3 text-gray-700 text-sm">
                    {row.householdSize}{" "}
                    {row.householdSize === 1 ? "person" : "people"}
                    {isHighlighted && (
                      <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-primary-600 bg-primary-100 px-1.5 py-0.5 rounded">
                        You
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 font-semibold text-gray-900">
                    {typeof row.monthlyLimit === "number" ? `$${row.monthlyLimit.toLocaleString()}/mo` : String(row.monthlyLimit || "—")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {footnote && (
        <p className="text-xs text-gray-400 mt-2 leading-relaxed">{footnote}</p>
      )}
    </div>
  );
}

// --- Asset Limits ---

function AssetLimitsDisplay({ limits }: { limits: NonNullable<StructuredEligibility["assetLimits"]> }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 md:p-6 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center shrink-0 mt-0.5">
          <Vault className="w-4 h-4 text-amber-600" aria-hidden="true" />
        </div>
        <div>
          <p className="font-medium text-gray-900">
            Assets must be under ${typeof limits.individual === "number" ? limits.individual.toLocaleString() : "—"}
            {limits.couple != null && typeof limits.couple === "number" && (
              <span className="text-gray-500 font-normal">
                {" "}(${limits.couple.toLocaleString()} for couples)
              </span>
            )}
          </p>
          <p className="text-sm text-gray-500 mt-1">But not everything counts.</p>
        </div>
      </div>

      {limits.exemptAssets && limits.exemptAssets.length > 0 && (
        <div className="pl-11">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">
            What doesn't count
          </p>
          <ul className="space-y-1">
            {limits.exemptAssets.map((a, i) => (
              <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" weight="bold" />
                {a}
              </li>
            ))}
          </ul>
          {limits.homeEquityCap && (
            <p className="text-xs text-gray-400 mt-2">
              Home equity exempt up to ${typeof limits.homeEquityCap === "number" ? limits.homeEquityCap.toLocaleString() : "—"}
            </p>
          )}
        </div>
      )}

      {limits.countedAssets && limits.countedAssets.length > 0 && (
        <div className="pl-11 pt-2 border-t border-gray-100">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">
            What does count
          </p>
          <p className="text-sm text-gray-500">
            {limits.countedAssets.map((a) => a.toLowerCase()).join(", ")}
          </p>
        </div>
      )}
    </div>
  );
}

// --- Document Checklist (interactive) ---

function DocumentChecklist({ documents, heading, programName }: { documents: string[]; heading?: string; programName?: string }) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const PREVIEW_COUNT = 3;
  const needsCollapse = documents.length > PREVIEW_COUNT + 1;

  const toggle = (i: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const progress = documents.length > 0 ? Math.round((checked.size / documents.length) * 100) : 0;
  const visibleDocs = needsCollapse && !expanded ? documents.slice(0, PREVIEW_COUNT) : documents;

  return (
    <div>
      {heading && (
        <p className="text-sm font-medium text-gray-900 mb-3">{heading}</p>
      )}

      {/* Progress bar + print */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-sm font-medium text-gray-500 tabular-nums">
          {checked.size}/{documents.length}
        </span>
        <button
          onClick={() => {
            const printContent = documents.map((d, i) => `${checked.has(i) ? "☑" : "☐"} ${d}`).join("\n");
            const w = window.open("", "_blank");
            if (w) {
              w.document.write(`<pre style="font-family:system-ui;font-size:14px;line-height:2">${programName ? `Documents for ${programName}\n${"—".repeat(40)}\n\n` : ""}${printContent}</pre>`);
              w.document.close();
              w.print();
            }
          }}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          aria-label="Print checklist"
          title="Print checklist"
        >
          <Printer className="w-4 h-4 text-gray-400 hover:text-gray-500" />
        </button>
      </div>

      <div className="relative">
        <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
          {visibleDocs.map((doc, i) => (
            <label
              key={i}
              className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-vanilla-50/50 transition-colors"
            >
              <input
                type="checkbox"
                checked={checked.has(i)}
                onChange={() => toggle(i)}
                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500/20"
              />
              <span
                className={`text-sm leading-relaxed transition-colors ${
                  checked.has(i) ? "text-gray-400 line-through" : "text-gray-700"
                }`}
              >
                {doc}
              </span>
            </label>
          ))}
        </div>

        {/* Gradient fade overlay when collapsed */}
        {needsCollapse && !expanded && (
          <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-vanilla-100 via-vanilla-100/80 to-transparent rounded-b-xl pointer-events-none" />
        )}
      </div>

      {/* Show all / collapse toggle */}
      {needsCollapse && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 text-sm font-medium text-primary-600 hover:text-primary-500 transition-colors"
        >
          {expanded ? "Show less" : `Show all ${documents.length} documents`}
        </button>
      )}

      {progress === 100 && (
        <p className="text-sm text-emerald-600 font-medium mt-3 flex items-center gap-1.5">
          <CheckCircle className="w-4 h-4" weight="fill" /> All documents ready
        </p>
      )}
    </div>
  );
}

// --- Step Journey (visual application steps) ---

function StepJourney({ steps }: { steps: { step: number; title: string; description: string }[] }) {
  return (
    <div className="relative">
      {/* Connecting line */}
      <div className="absolute left-[15px] top-8 bottom-8 w-px bg-gray-200" aria-hidden="true" />

      <div className="space-y-0">
        {steps.map((step, i) => (
          <div key={step.step} className="relative flex items-start gap-4 pb-8 last:pb-0">
            {/* Step number circle */}
            <div className="relative z-10 flex items-center justify-center w-8 h-8 rounded-full bg-gray-900 text-white text-xs font-bold shrink-0">
              {step.step}
            </div>
            <div className="pt-1 min-w-0">
              <p className="font-semibold text-gray-900 leading-snug">{step.title}</p>
              <p className="text-sm text-gray-600 mt-1 leading-relaxed">{step.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Contact Cards ---

function ContactCards({ contacts }: { contacts: { label: string; description?: string | null; phone?: string | null; hours?: string | null }[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {contacts.map((c, i) => (
        <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 space-y-2 hover:border-primary-200 hover:shadow-sm transition-all">
          <p className="font-medium text-gray-900 text-sm">{c.label}</p>
          {c.description && (
            <p className="text-xs text-gray-500 leading-relaxed">{c.description}</p>
          )}
          {c.phone && (
            <a
              href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600 hover:text-primary-500 transition-colors"
            >
              <Phone className="w-3.5 h-3.5" />
              {c.phone}
            </a>
          )}
          {c.hours && (
            <p className="text-xs text-gray-400">{c.hours}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// --- Application Notes (conditional warnings/tips) ---

function ApplicationNotes({ notes }: { notes: string[] }) {
  return (
    <div>
      <SectionLabel>Good to know</SectionLabel>
      <ul className="space-y-2.5">
        {notes.map((note, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm text-gray-600 leading-relaxed">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
            {note}
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- FAQ Section ---

function FaqSection({ faqs, label = "Common questions" }: { faqs: { question: string; answer: string }[]; label?: string }) {
  if (!faqs || faqs.length === 0) return null;
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <div className="divide-y divide-gray-200">
        {faqs.map((faq, i) => (
          <details key={i} className="group py-4 first:pt-0">
            <summary className="flex items-start justify-between gap-4 cursor-pointer list-none text-gray-900 font-medium leading-snug hover:text-gray-700 transition-colors">
              {faq.question}
              <CaretDown className="w-4 h-4 text-gray-500 shrink-0 mt-1 transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <p className="mt-2 text-sm text-gray-600 leading-relaxed pr-8">{faq.answer}</p>
          </details>
        ))}
      </div>
    </div>
  );
}

// --- Content Section Renderer (from pipeline contentSections) ---

function RenderContentSection({ section }: { section: ContentSection }) {
  if (section.type === "callout" && "text" in section) {
    const borderColor: Record<string, string> = {
      warning: "border-amber-400 bg-amber-50/60",
      tip: "border-primary-400 bg-primary-50/40",
      info: "border-gray-300 bg-gray-50/60",
    };
    const tone = "tone" in section ? String(section.tone) as "warning" | "tip" | "info" : "info";
    return (
      <div className={`p-3.5 rounded-lg border-l-2 ${borderColor[tone] || borderColor.info}`}>
        <p className="text-sm text-gray-700 leading-relaxed">{String(section.text)}</p>
      </div>
    );
  }

  if (section.type === "tier-comparison" && "tiers" in section) {
    const tiers = section.tiers as { name: unknown; description: unknown; incomeLimit?: unknown; coverage?: unknown }[];
    // Drafts are model-written: a tier field can arrive as {single, couple}
    // or a list, which React can't render and which failed the whole build
    // (CT Medicare Savings, 6 Oct 2026). Render any shape as text.
    const text = (v: unknown): string =>
      v == null ? "" : typeof v === "object" ? (Array.isArray(v) ? v.map(text).join(", ") : Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}: ${text(x)}`).join(", ")) : String(v);
    return (
      <div>
        {section.heading && <p className="text-sm font-medium text-gray-900 mb-3">{text(section.heading)}</p>}
        <div className="space-y-3">
          {tiers.map((tier, i) => (
            <div key={i} className="p-4 rounded-xl border border-gray-200 bg-white">
              <p className="font-medium text-gray-900">{text(tier.name)}</p>
              <p className="text-sm text-gray-600 mt-1">{text(tier.description)}</p>
              {tier.incomeLimit ? <p className="text-xs text-gray-400 mt-1">Income limit: {text(tier.incomeLimit)}</p> : null}
              {tier.coverage ? <p className="text-xs text-gray-400">Coverage: {text(tier.coverage)}</p> : null}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (section.type === "prose" && "body" in section) {
    return (
      <div>
        {section.heading && <p className="text-sm font-medium text-gray-900 mb-2">{section.heading}</p>}
        <div className="text-gray-700 leading-relaxed space-y-3">
          {String(section.body).split("\n\n").map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      </div>
    );
  }

  if (section.type === "income-table" && "rows" in section) {
    const rows = section.rows as { householdSize: number; monthlyLimit: number }[];
    return (
      <IncomeTable
        rows={rows}
        heading={section.heading ? String(section.heading) : undefined}
        footnote={"footnote" in section ? String(section.footnote) : undefined}
      />
    );
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Coverage grid — "What's included" icon grid, extracted from intro/description
// ═══════════════════════════════════════════════════════════════════════════════

const COVERAGE_ICONS: Record<string, PhosphorIcon> = {
  medical: Stethoscope,
  doctor: Stethoscope,
  hospital: FirstAid,
  home: HouseIcon,
  attendant: Users,
  personal: Users,
  dental: Tooth,
  vision: Eye,
  transport: Car,
  prescription: Pill,
  equipment: Wheelchair,
  modification: Wrench,
  respite: Heart,
  financial: HandCoins,
};

function extractCoverageItems(program: WaiverProgram): { label: string; icon: PhosphorIcon }[] {
  // Parse coverage from intro + description + content sections
  const text = `${program.intro || ""} ${program.description || ""}`.toLowerCase();
  const items: { label: string; icon: PhosphorIcon }[] = [];
  const seen = new Set<string>();

  const patterns: [RegExp, string, string][] = [
    [/doctor visit|medical care|physician/i, "Doctor visits", "medical"],
    [/hospital/i, "Hospital care", "hospital"],
    [/personal attendant|attendant service|in-home care/i, "Personal attendants", "attendant"],
    [/home modification|adaptive aid|home repair/i, "Home modifications", "modification"],
    [/dental/i, "Dental care", "dental"],
    [/\bvision\b/i, "Vision care", "vision"],
    [/transport/i, "Transportation", "transport"],
    [/prescription|medication/i, "Prescriptions", "prescription"],
    [/medical equipment|wheelchair|durable medical/i, "Medical equipment", "equipment"],
    [/day program|adult day/i, "Day programs", "home"],
    [/respite/i, "Respite care", "respite"],
  ];

  for (const [regex, label, iconKey] of patterns) {
    if (regex.test(text) && !seen.has(iconKey)) {
      seen.add(iconKey);
      items.push({ label, icon: COVERAGE_ICONS[iconKey] || Stethoscope });
    }
  }

  return items;
}

function CoverageGrid({ items }: { items: { label: string; icon: PhosphorIcon }[] }) {
  if (items.length === 0) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {items.map((item, i) => {
        const Icon = item.icon;
        return (
          <div key={i} className="flex items-center gap-2.5 p-3 rounded-xl bg-white border border-gray-100">
            <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4 text-primary-600" weight="duotone" />
            </div>
            <span className="text-sm text-gray-700 leading-snug">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Utility: find related program slugs for linking
// ═══════════════════════════════════════════════════════════════════════════════

function findProgramSlug(name: string, state: StateData): string | null {
  const needle = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const p of state.programs) {
    const pName = p.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const pShort = (p.shortName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (pName === needle || pShort === needle || pName.includes(needle) || needle.includes(pName)) {
      return p.id;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Resource One-Pager — for simple programs (hotlines, counseling, companion)
// No sections. Just what it is, who to call, where to go.
// ═══════════════════════════════════════════════════════════════════════════════

function ResourceOnePager({ program }: { program: WaiverProgram }) {
  const contacts = (program).contacts || [];

  return (
    <div className="space-y-8">
      {program.intro && (
        <div className="text-lg text-gray-600 leading-relaxed space-y-4">
          {program.intro.split("\n\n").map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      )}

      {(program.phone || contacts.length > 0) && (
        <div className="rounded-2xl bg-primary-50/60 border border-primary-200/50 p-6">
          {contacts.length > 0 ? (
            <div className="space-y-4">
              {contacts.map((c, i) => (
                <div key={i}>
                  <p className="text-sm font-medium text-gray-900">{c.label}</p>
                  {c.phone && (
                    <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="text-2xl font-bold text-primary-700 hover:text-primary-600 font-serif transition-colors">
                      {c.phone}
                    </a>
                  )}
                  {c.hours && <p className="text-xs text-gray-500 mt-0.5">{c.hours}</p>}
                  {c.description && <p className="text-sm text-gray-600 mt-1">{c.description}</p>}
                </div>
              ))}
            </div>
          ) : program.phone ? (
            <div>
              <p className="text-sm font-medium text-gray-900 mb-1">Call for help</p>
              <a href={`tel:${program.phone}`} className="text-2xl font-bold text-primary-700 hover:text-primary-600 font-serif transition-colors">
                {program.phone}
              </a>
            </div>
          ) : null}
        </div>
      )}

      {program.contentSections && program.contentSections.length > 0 && (
        <div className="space-y-6">
          {program.contentSections.map((section, i) => (
            <RenderContentSection key={i} section={section} />
          ))}
        </div>
      )}

      {program.sourceUrl && (
        <div className="text-sm">
          <a href={program.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:text-primary-500 font-medium underline underline-offset-2 decoration-primary-200 transition-colors inline-flex items-center gap-1.5">
            <Globe className="w-4 h-4" /> Official source
          </a>
        </div>
      )}

      {program.faqs && program.faqs.length > 0 && (
        <FaqSection faqs={program.faqs} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Section nav — sticky horizontal wayfinding (not tabs, no content hiding)
// ═══════════════════════════════════════════════════════════════════════════════

interface NavSection {
  id: string;
  label: string;
}

function SectionNav({ sections, activeId, hasRail }: { sections: NavSection[]; activeId: string; hasRail?: boolean }) {
  return (
    <div className="sticky top-0 z-30 bg-vanilla-100/95 backdrop-blur-sm border-b border-gray-200/60">
      <nav className={hasRail ? "xl:max-w-[69rem] xl:mx-auto xl:flex xl:items-start xl:gap-10 xl:px-8" : "max-w-3xl mx-auto px-6 lg:px-8"}>
        <div className={`min-w-0 ${hasRail ? "max-w-3xl mx-auto px-6 lg:px-8 xl:max-w-none xl:mx-0 xl:flex-1" : ""}`}>
        <div className="flex gap-1 py-2 overflow-x-auto scrollbar-hide -mx-1">
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap active:scale-95 transition-all ${
                activeId === s.id
                  ? "bg-gray-900 text-white border border-gray-900"
                  : "bg-white/60 border border-gray-200/70 text-gray-600 hover:text-gray-800 hover:bg-white"
              }`}
            >
              {s.label}
            </a>
          ))}
        </div>
        </div>
        {hasRail && <div className="hidden xl:block xl:w-[21rem] xl:shrink-0" aria-hidden="true" />}
      </nav>
    </div>
  );
}

function useSectionObserver(sectionIds: string[]): string {
  const [activeId, setActiveId] = useState(sectionIds[0] || "");

  useEffect(() => {
    if (sectionIds.length === 0) return;
    const visible = new Set<string>();
    const observers: IntersectionObserver[] = [];

    const recompute = () => {
      for (const id of sectionIds) {
        if (visible.has(id)) {
          setActiveId(id);
          return;
        }
      }
    };

    for (const id of sectionIds) {
      const el = document.getElementById(id);
      if (!el) continue;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
          recompute();
        },
        { rootMargin: "-80px 0px -60% 0px", threshold: 0 }
      );
      observer.observe(el);
      observers.push(observer);
    }

    return () => observers.forEach((o) => o.disconnect());
  }, [sectionIds]);

  return activeId;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main component — single-scroll page. No tabs. Each section earns its space.
// ═══════════════════════════════════════════════════════════════════════════════

interface RelatedArticle {
  slug: string;
  title: string;
  cover_image_url?: string | null;
  reading_time_minutes?: number | null;
  section?: string | null;
}

interface ProgramPageV3Props {
  program: WaiverProgram;
  state: StateData;
  relatedArticles?: RelatedArticle[];
}

function BookmarkButton({ program, state }: { program: WaiverProgram; state: StateData }) {
  const { isSaved, toggleSave } = useSavedPrograms();
  const saved = isSaved(program.id);
  return (
    <button
      onClick={() => toggleSave({ programId: program.id, stateId: state.id, name: program.name, shortName: program.shortName, programType: program.programType, savingsRange: program.savingsRange || undefined })}
      className="group p-2 -m-2 rounded-lg hover:bg-gray-100 active:scale-90 transition-all"
      aria-label={saved ? "Remove from saved programs" : "Save this program"}
      title={saved ? "Saved" : "Save program"}
    >
      <BookmarkSimple className={`w-5 h-5 transition-colors duration-150 ${saved ? "text-primary-600" : "text-gray-300 group-hover:text-gray-400"}`} weight={saved ? "fill" : "regular"} />
    </button>
  );
}

// Share + bookmark cluster. Self-contained so it can sit in the mobile
// top bar (next to the back link) AND in the desktop title row without
// the headline ever having to share horizontal space with it.
function HeaderActions({
  program,
  state,
  className = "",
}: {
  program: WaiverProgram;
  state: StateData;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <button
        onClick={() => {
          if (typeof navigator !== "undefined" && navigator.share) {
            navigator.share({ title: program.name, url: window.location.href });
          } else if (typeof navigator !== "undefined") {
            navigator.clipboard.writeText(window.location.href);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }
        }}
        className="group p-2 -m-1 rounded-lg hover:bg-gray-100 active:scale-90 transition-all"
        aria-label="Share this program"
        title={copied ? "Link copied!" : "Share"}
      >
        {copied ? <Check className="w-5 h-5 text-emerald-500" weight="bold" /> : <ShareNetwork className="w-5 h-5 text-gray-300 group-hover:text-gray-400 transition-colors" />}
      </button>
      <BookmarkButton program={program} state={state} />
    </div>
  );
}

export function ProgramPageV3({ program, state, relatedArticles }: ProgramPageV3Props) {
  const programType = program.programType || "benefit";
  const isFederal = program.geographicScope?.type === "federal";
  const isResource = programType === "resource" || programType === "navigator";

  const elig = program.structuredEligibility;
  const guide = program.applicationGuide;
  const documents = program.documentsNeeded || [];
  const applicationNotes = program.applicationNotes || [];
  const contacts = program.contacts || [];
  const relatedPrograms = program.relatedPrograms || [];
  const coverageItems = extractCoverageItems(program);

  // Build section nav items based on available data
  const navSections: NavSection[] = [];
  if (!isResource) {
    navSections.push({ id: "overview", label: "Overview" });
    if (elig) navSections.push({ id: "eligibility", label: "Eligibility" });
    if (guide) navSections.push({ id: "how-to-apply", label: "How to Apply" });
    if (contacts.length > 0 || program.phone || program.sourceUrl) navSections.push({ id: "contact", label: "Contact" });
    if (program.faqs && program.faqs.length > 0) navSections.push({ id: "faq", label: "FAQ" });
  }
  const sectionIds = navSections.map((s) => s.id);
  const activeSection = useSectionObserver(sectionIds);

  const primaryPhone = program.phone || contacts.find((c) => c.phone)?.phone || null;

  // Benefits conversion card — the "soft lane" (see if you qualify → email →
  // we send eligibility + matches). Shown for benefit-type programs only;
  // resources/navigators/employment aren't things you "qualify" for, so the
  // framing would be wrong. Desktop renders it as a sticky rail; below xl it
  // becomes the fixed bottom bar (which replaces the call pill — see below).
  const showBenefitsCTA = !isResource && program.programType === "benefit";
  const benefitsCareNeed = showBenefitsCTA ? deriveProgramCareNeed(program) : "payingForCare";

  // One-time, page-level ownership of the benefits funnel: fire the entry-view
  // event once and fetch the state's program list once, then pass both down to
  // the rail + mobile cards. Deliberately here, not in the card — the rail
  // renders hidden on mobile (display:none but still mounted) and the sheet
  // mounts a second card, so card-owned effects would double-fire
  // benefits_entry_viewed and double-fetch. One owner = one event, one fetch.
  const [benefitsPrograms, setBenefitsPrograms] = useState<BenefitsProgram[]>([]);
  const [benefitsSessionId, setBenefitsSessionId] = useState("");
  const benefitsEntryFiredRef = useRef(false);
  // Program card flow experiment (control | three_tap). Assigned once here,
  // the same single owner as the entry-view event, and passed to both card
  // instances so the rail and the sheet can never disagree.
  const cardFlow = useProgramCardFlow(showBenefitsCTA);
  // The card view waits for the arm so every view is tagged with it; that is
  // the denominator of the experiment (signups ÷ card views per arm).
  useEffect(() => {
    if (!showBenefitsCTA || !cardFlow || benefitsEntryFiredRef.current) return;
    benefitsEntryFiredRef.current = true;
    trackBenefitsEvent({
      event: "benefits_entry_viewed",
      sessionId: getOrCreateSessionId(),
      stateCode: state.abbreviation,
      stateName: state.name,
      providerName: null,
      providerSlug: null,
      variant: "program_card",
      entrySource: `/benefits/${state.id}/${program.id}`,
      cardFlow,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBenefitsCTA, cardFlow]);
  useEffect(() => {
    if (!showBenefitsCTA) return;
    const sid = getOrCreateSessionId();
    setBenefitsSessionId(sid);
    let cancelled = false;
    fetch(`/api/benefits/programs?state=${encodeURIComponent(state.abbreviation)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data || !Array.isArray(data.allPrograms)) return;
        setBenefitsPrograms(data.allPrograms);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBenefitsCTA]);

  const benefitsCardProps = {
    programId: program.id,
    programName: getDisplayName(program, state),
    programShortName: program.shortName,
    savingsRange: program.savingsRange,
    programType: program.programType,
    stateCode: state.abbreviation,
    stateName: state.name,
    stateId: state.id,
    careNeed: benefitsCareNeed,
    programs: benefitsPrograms,
    sessionId: benefitsSessionId,
    cardFlow,
    incomeTable: program.structuredEligibility?.incomeTable ?? null,
    callContact: pickCallContact(program.contacts),
  };

  return (
    <div className="bg-vanilla-100 min-h-[100dvh]">
      {/* Structured data */}
      {program.faqs && program.faqs.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: program.faqs.map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answer } })) }) }} />
      )}

      {/* ─── 1. Hero ─── */}
      <header className="relative pt-6 pb-10 md:pt-8 md:pb-14 overflow-hidden">
        <HeaderAccent />
        <div className={`relative ${showBenefitsCTA ? "xl:max-w-[69rem] xl:mx-auto xl:flex xl:items-start xl:gap-10 xl:px-8" : ""}`}>
          <div className={`max-w-2xl mx-auto px-6 lg:px-8 ${showBenefitsCTA ? "xl:max-w-none xl:mx-0 xl:flex-1 min-w-0" : ""}`}>
          {/* Mobile: a utility top bar — back affordance on the left, share/
              bookmark on the right — so the headline below owns the full
              width and never competes with the action buttons for space
              (the Zapier/Notion pattern). The full title repeats verbatim
              as the H1, and the SEO BreadcrumbList is separate JSON-LD in
              page.tsx, so collapsing the visual trail here costs nothing. */}
          <div className="sm:hidden flex items-center justify-between mb-5">
            <Link
              href={`/benefits/${state.id}`}
              className="inline-flex items-center gap-1 text-sm text-gray-500 -ml-1.5 pl-1 pr-2 py-1.5 rounded-lg active:bg-gray-100 transition-colors"
            >
              <CaretLeft className="w-4 h-4 shrink-0" /> {state.name}
            </Link>
            <HeaderActions program={program} state={state} className="-mr-1" />
          </div>
          <nav className="hidden sm:flex items-center gap-1.5 text-sm text-gray-400 mb-6">
            <Link href="/senior-benefits" className="hover:text-gray-600 transition-colors">Benefits Hub</Link>
            <span>›</span>
            <Link href={`/benefits/${state.id}`} className="hover:text-gray-600 transition-colors">{state.name}</Link>
            <span>›</span>
            <span className="text-gray-600 truncate max-w-[55%]">{getDisplayName(program, state)}</span>
          </nav>

          <div className="sm:flex sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0 sm:flex-1">
              <h1 className="text-[1.625rem] sm:text-display-sm md:text-display-md font-bold text-gray-900 font-serif leading-[1.15] sm:leading-tight [text-wrap:pretty] [hyphens:none]">
                <span className="relative inline-block">
                  {getDisplayName(program, state)}
                  <HandDrawnUnderline />
                </span>
              </h1>
              {program.tagline && program.tagline !== program.description && (
                <p className="mt-4 text-lg text-gray-600 leading-relaxed max-w-xl">{program.tagline}</p>
              )}
              {/* When the benefits card is shown it owns the savings number
                  (in the rail / bottom bar), so we drop the hero line to
                  avoid showing the same figure twice. Non-benefit pages keep
                  it here since they have no card. */}
              {program.savingsRange && !showBenefitsCTA ? (
                <p className="mt-3 text-sm text-gray-500">
                  Estimated savings: <span className="font-semibold text-gray-700">{program.savingsRange}</span>
                  {program.savingsSource && program.savingsSource !== "Free service" && (
                    <span className="text-gray-400 ml-1">({program.savingsSource})</span>
                  )}
                </p>
              ) : null}
              {(() => {
                const { author: verifier, reviewedAt, hasExplicitReview } = getProgramVerifier(state.abbreviation, program.id);
                const isReviewed =
                  program.contentStatus === "approved" ||
                  program.contentStatus === "published" ||
                  hasExplicitReview;
                // Unreviewed pipeline draft: show the dated status badge only —
                // no named "Published by / Verified by" credit on content a human
                // hasn't checked (keeps the MD verification signal honest).
                if (!isReviewed) {
                  return (
                    <ContentStatusBadge
                      contentStatus={program.contentStatus}
                      draftedAt={program.draftedAt}
                      reviewedAt={program.reviewedAt}
                      className="mt-4"
                    />
                  );
                }
                const { author: publisher } = getProgramPublisher(state.abbreviation, program.id);
                // Freshness date: explicit signoff → program metadata → state QA date.
                const verifiedAt =
                  reviewedAt || program.reviewedAt || program.lastVerifiedDate || getStateReviewedAt(state.abbreviation);
                return (
                  <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-500">
                    <ReviewerAvatar author={publisher} />
                    <span className="text-gray-400">Published by</span>
                    <Link
                      href={`/author/${publisher.slug}`}
                      className="font-medium text-gray-700 hover:text-primary-600 transition-colors"
                    >
                      {publisher.name}
                    </Link>
                    <span className="text-gray-300">·</span>
                    <ReviewerAvatar author={verifier} />
                    <span className="text-gray-400">Verified by</span>
                    <Link
                      href={`/author/${verifier.slug}`}
                      className="font-medium text-gray-700 hover:text-primary-600 transition-colors"
                    >
                      {verifier.name}
                    </Link>
                    {verifiedAt && (
                      <>
                        <span className="text-gray-300">·</span>
                        <span className="text-gray-400">
                          Last verified {formatReviewDate(verifiedAt)}
                        </span>
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
            <HeaderActions program={program} state={state} className="hidden sm:flex shrink-0 mt-2" />
          </div>
          </div>
          {showBenefitsCTA && (
            <div className="hidden xl:block xl:w-[21rem] xl:shrink-0" aria-hidden="true" />
          )}
        </div>
      </header>

      {/* ─── Section nav ─── */}
      {navSections.length > 0 && <SectionNav sections={navSections} activeId={activeSection} hasRail={showBenefitsCTA} />}

      <main className="pb-24 pt-8">
        {/* Two-column on xl+: editorial content column + sticky benefits rail
            (the Airbnb listing pattern). Below xl it collapses to the single
            column it has always been; the rail's job is taken by the fixed
            bottom bar (ProgramBenefitsMobileCTA). Per-section max-widths are
            preserved — they center within the content column instead of the
            viewport. items-start + self-start lets the rail stick. */}
        <div className="xl:mx-auto xl:flex xl:max-w-[69rem] xl:items-start xl:gap-10 xl:px-8">
          <div className="min-w-0 xl:flex-1">
        {isResource ? (
          <div className="max-w-2xl mx-auto px-6 lg:px-8">
            <ResourceOnePager program={program} />
          </div>
        ) : (
          <>
            {/* ─── 2. Intro prose ─── */}
            {program.intro && (
              <section id="overview" className="max-w-2xl mx-auto px-6 lg:px-8 mb-10 sm:mb-16 scroll-mt-20">
                <div className="text-lg text-gray-600 leading-relaxed space-y-4">
                  {program.intro.split("\n\n").map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                </div>
              </section>
            )}

            {/* ─── 5. What's covered (icon grid + prose context) ─── */}
            {coverageItems.length > 0 && (
              <section className="max-w-3xl mx-auto px-6 lg:px-8 mb-10 sm:mb-16">
                <SectionLabel>What&apos;s covered</SectionLabel>
                <CoverageGrid items={coverageItems} />
                {/* Content sections that aren't callouts — tier comparisons, prose expansions */}
                {program.contentSections && program.contentSections.filter((s) => s.type !== "callout").length > 0 && (
                  <div className="mt-8 max-w-2xl space-y-6">
                    {program.contentSections.filter((s) => s.type !== "callout").map((section, i) => (
                      <RenderContentSection key={i} section={section} />
                    ))}
                  </div>
                )}
              </section>
            )}

            <WavyDivider className="my-10 sm:my-16 max-w-3xl mx-auto px-6" />

            {/* ─── 6. Eligibility details ─── */}
            {elig && (
              <section id="eligibility" className="max-w-2xl mx-auto px-6 lg:px-8 mb-10 sm:mb-16 space-y-10 scroll-mt-20">
                <div>
                  <SectionLabel>Eligibility details</SectionLabel>
                  <SectionHeading>Do you qualify?</SectionHeading>
                  <p className="text-gray-600 mt-1">Full requirements for this program.</p>
                </div>

                {/* Income table — wider */}
                {elig.incomeTable && elig.incomeTable.filter((r) => typeof r.monthlyLimit === "number" && typeof r.householdSize === "number").length > 0 && (
                  <div className="max-w-3xl">
                    <IncomeTable
                      rows={elig.incomeTable.filter((r) => typeof r.monthlyLimit === "number" && typeof r.householdSize === "number")}
                      heading="Income limits by household size"
                      footnote={elig.povertyLevelReference || undefined}
                    />
                  </div>
                )}

                {/* Asset limits */}
                {elig.assetLimits && (
                  <div>
                    <SectionLabel>Asset limits</SectionLabel>
                    <AssetLimitsDisplay limits={elig.assetLimits} />
                  </div>
                )}

                {/* Functional requirement */}
                {elig.functionalRequirement && (
                  <div>
                    <SectionLabel>Medical / functional requirement</SectionLabel>
                    <div className="p-4 rounded-xl bg-primary-50/40 border-l-2 border-primary-400">
                      <p className="text-sm text-gray-700 leading-relaxed">{elig.functionalRequirement}</p>
                    </div>
                  </div>
                )}

                {/* Other requirements */}
                {elig.otherRequirements && elig.otherRequirements.length > 0 && (
                  <div>
                    <SectionLabel>Other requirements</SectionLabel>
                    <ul className="space-y-2">
                      {elig.otherRequirements.map((r, i) => (
                        <li key={i} className="text-sm text-gray-600 flex items-start gap-2.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0 mt-2" />
                          <span className="leading-relaxed">{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}

            {/* ─── 7. How to apply — background shift for zone change ─── */}
            {guide && (
              <section id="how-to-apply" className="scroll-mt-20 mb-10 sm:mb-16">
                <div className="bg-vanilla-200/30 py-10 sm:py-14">
                  <div className="max-w-2xl mx-auto px-6 lg:px-8 space-y-10">
                <div>
                  <SectionLabel>Application process</SectionLabel>
                  <SectionHeading>How to apply</SectionHeading>
                  <p className="text-lg text-gray-600 leading-relaxed mt-2">{guide.summary}</p>
                  {guide.tip && (
                    <div className="mt-4 flex items-start gap-2.5 p-3.5 rounded-lg bg-primary-50/40 border-l-2 border-primary-400">
                      <Info className="w-4 h-4 text-primary-500 shrink-0 mt-0.5" />
                      <p className="text-sm text-gray-700 leading-relaxed">{guide.tip}</p>
                    </div>
                  )}
                </div>

                {/* Document checklist — wider, it's a tool */}
                {documents.length > 0 && (
                  <div className="max-w-3xl">
                    <SectionLabel>Documents you&apos;ll need</SectionLabel>
                    <DocumentChecklist documents={documents} programName={program.name} />
                  </div>
                )}

                {/* Application notes */}
                {applicationNotes.length > 0 && (
                  <ApplicationNotes notes={applicationNotes} />
                )}

                {/* Step journey */}
                {guide.steps && guide.steps.length > 0 && (
                  <div>
                    <SectionLabel>Steps to apply</SectionLabel>
                    <StepJourney steps={guide.steps} />
                  </div>
                )}

                {/* Processing time / waitlist */}
                {(guide.processingTime || guide.waitlist) && (
                  <div className={`grid gap-3 max-w-3xl ${guide.processingTime && guide.waitlist ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
                    {guide.processingTime && (
                      <div className="rounded-xl border border-gray-200 bg-white p-4 flex items-start gap-3">
                        <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                          <Clock className="w-5 h-5 text-gray-500" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-0.5">Processing time</p>
                          <p className="text-sm text-gray-700 leading-relaxed">{guide.processingTime}</p>
                        </div>
                      </div>
                    )}
                    {guide.waitlist && (
                      <div className="rounded-xl border border-amber-200/60 bg-amber-50/40 p-4 flex items-start gap-3">
                        <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                          <HourglassHigh className="w-5 h-5 text-amber-600" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-0.5">Waitlist</p>
                          <p className="text-sm text-gray-700 leading-relaxed">{guide.waitlist}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Application URLs */}
                {guide.urls && guide.urls.length > 0 && (
                  <div className="flex flex-wrap gap-3">
                    {guide.urls.map((u, i) => (
                      <a key={i} href={u.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors">
                        {u.label}
                        <ArrowSquareOut className="w-3.5 h-3.5" />
                      </a>
                    ))}
                  </div>
                )}
                  </div>
                </div>
              </section>
            )}

            {/* Service areas map — widest moment */}
            {program.serviceAreas && program.serviceAreas.length > 0 && (
              <section className="max-w-5xl mx-auto px-6 lg:px-8 mb-10 sm:mb-16">
                <SectionLabel>Service areas</SectionLabel>
                <div className="rounded-2xl border border-gray-200 overflow-hidden bg-white">
                  <div className="grid grid-cols-1 lg:grid-cols-2">
                    <div className="p-6">
                      <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
                        {program.serviceAreas.map((area) => (
                          <div key={area.name} className="py-2">
                            <CityBadge name={area.name} />
                            <p className="text-sm text-gray-500 mt-1">{area.description}</p>
                          </div>
                        ))}
                      </div>
                      {program.phone && (
                        <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                          <p className="text-sm text-gray-500">Don&apos;t see your area?</p>
                          <a href={`tel:${program.phone}`} className="text-sm font-medium text-primary-600 hover:text-primary-500 transition-colors">Call {program.phone}</a>
                        </div>
                      )}
                    </div>
                    <div className="border-t lg:border-t-0 lg:border-l border-gray-200 bg-gray-50">
                      <ServiceAreasMap stateId={state.id} areas={program.serviceAreas} mapPins={program.mapPins} programName={program.name} noWrapper />
                    </div>
                  </div>
                </div>
              </section>
            )}

            <WavyDivider className="my-10 sm:my-16 max-w-3xl mx-auto px-6" />

            {/* ─── 9. Contact block — warm, prominent ─── */}
            {(contacts.length > 0 || program.phone || program.sourceUrl) && (
              <section id="contact" className="max-w-3xl mx-auto px-6 lg:px-8 mb-10 sm:mb-16 scroll-mt-20">
                <div className="rounded-2xl bg-vanilla-200/60 border border-vanilla-300/50 p-6 md:p-8 space-y-6">
                  {contacts.length > 0 ? (
                    <div>
                      <SectionLabel>Get in touch</SectionLabel>
                      <ContactCards contacts={contacts} />
                    </div>
                  ) : program.phone ? (
                    <div>
                      <SectionLabel>Contact</SectionLabel>
                      <a href={`tel:${program.phone}`} className="inline-flex items-center gap-2 text-xl font-semibold text-primary-600 hover:text-primary-500 transition-colors">
                        <Phone className="w-5 h-5" />
                        {program.phone}
                      </a>
                    </div>
                  ) : null}

                  {program.sourceUrl && (
                    <div>
                      <a href={program.sourceUrl} data-growth-contact="official_site" data-growth-surface="program_contact" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-500 underline underline-offset-2 decoration-primary-200 transition-colors">
                        <Globe className="w-4 h-4" /> Visit official program page
                      </a>
                      {program.lastVerifiedDate && (
                        <p className="text-xs text-gray-400 mt-1">Last verified {program.lastVerifiedDate}</p>
                      )}
                    </div>
                  )}

                  {/* Application forms */}
                  {program.forms && program.forms.length > 0 && (
                    <div>
                      <SectionLabel>Application forms</SectionLabel>
                      <div className="space-y-2">
                        {program.forms.map((form) => (
                          <a key={form.id} href={form.url} data-growth-contact="application_form" data-growth-surface="program_contact" target="_blank" rel="noopener noreferrer" className="block p-3 rounded-lg border border-gray-200 bg-white hover:border-primary-300 hover:shadow-sm transition-all group">
                            <p className="font-medium text-sm text-gray-900 group-hover:text-primary-700 transition-colors flex items-center gap-1.5">
                              <FileText className="w-4 h-4 text-gray-400 group-hover:text-primary-500 transition-colors" />
                              {form.name}
                            </p>
                            {form.description && <p className="text-xs text-gray-500 mt-0.5 pl-5.5">{form.description}</p>}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* ─── 10. Related programs ─── */}
            {(() => {
              const linked = relatedPrograms
                .map((name) => ({ name, slug: findProgramSlug(name, state) }))
                .filter((r): r is { name: string; slug: string } => r.slug !== null);
              if (linked.length === 0) return null;
              return (
                <section className="max-w-2xl mx-auto px-6 lg:px-8 mb-10 sm:mb-16">
                  <SectionLabel>Related programs</SectionLabel>
                  <div className="flex flex-wrap gap-2">
                    {linked.map((r, i) => (
                      <Link key={i} href={`/benefits/${state.id}/${r.slug}`} className="text-sm font-medium text-primary-700 bg-primary-50 px-3 py-1.5 rounded-full hover:bg-primary-100 transition-colors">
                        {r.name}
                      </Link>
                    ))}
                  </div>
                </section>
              );
            })()}

            {/* ─── 11. Things to know (callouts) ─── */}
            {(() => {
              // Only count callouts that actually carry text. Pipeline drafts
              // sometimes emit an empty callout (no `text`), which previously
              // rendered the "Things to know" heading over an empty <p>.
              const calloutTexts = (program.contentSections || [])
                .filter((s) => s.type === "callout" && "text" in s)
                .map((s) => String((s as { text: unknown }).text).trim())
                .filter((t) => t.length > 0);
              if (calloutTexts.length === 0) return null;
              return (
                <section className="max-w-2xl mx-auto px-6 lg:px-8 mb-10 sm:mb-16">
                  <SectionLabel>Things to know</SectionLabel>
                  <div className="text-sm text-gray-700 leading-relaxed space-y-3">
                    {calloutTexts.map((t, i) => (
                      <p key={i}>{t}</p>
                    ))}
                  </div>
                </section>
              );
            })()}

            {/* ─── 12. FAQs ─── */}
            {program.faqs && program.faqs.length > 0 && (
              <section id="faq" className="max-w-2xl mx-auto px-6 lg:px-8 mb-10 sm:mb-16 scroll-mt-20">
                <FaqSection faqs={program.faqs} />
              </section>
            )}
          </>
        )}

        {/* ─── 13. Related articles ─── */}
        {relatedArticles && relatedArticles.length > 0 && (
          <section className="max-w-3xl mx-auto px-6 lg:px-8 pt-10 border-t border-gray-200">
            <SectionLabel>Related articles</SectionLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {relatedArticles.map((article) => {
                const href = article.section ? `/${article.section}/${article.slug}` : `/research-and-press/${article.slug}`;
                return (
                  <Link key={article.slug} href={href} className="group block">
                    {article.cover_image_url && (
                      <div className="rounded-xl overflow-hidden mb-3">
                        <img src={article.cover_image_url} alt={article.title} className="w-full aspect-[3/2] object-cover group-hover:opacity-90 transition-opacity" />
                      </div>
                    )}
                    <h3 className="text-sm font-semibold text-gray-900 group-hover:text-primary-600 transition-colors leading-snug">{article.title}</h3>
                    {article.reading_time_minutes && <p className="text-xs text-gray-400 mt-1">{article.reading_time_minutes} min read</p>}
                  </Link>
                );
              })}
            </div>
          </section>
        )}
          </div>

          {/* Desktop sticky rail — the soft "see if you qualify" lane. */}
          {showBenefitsCTA && (
            <aside className="hidden xl:block xl:w-[21rem] xl:shrink-0 xl:self-start xl:sticky xl:top-24">
              <ProgramBenefitsCard {...benefitsCardProps} variant="rail" />
            </aside>
          )}
        </div>
      </main>

      {/* Mobile floating call action — the one real thing a stressed caregiver
          is here to do (call to apply) is otherwise buried in mid-page prose.
          Labeled, not icon-only, for senior-user clarity. Safe-area padded so
          it never sits under the iPhone home-indicator. Desktop has the
          contact section inline and doesn't need this. */}
      {showBenefitsCTA ? (
        <ProgramBenefitsMobileCTA {...benefitsCardProps} />
      ) : primaryPhone ? (
        <a
          href={`tel:${primaryPhone.replace(/[^\d+]/g, "")}`}
          className="md:hidden fixed right-4 z-40 inline-flex items-center gap-2 rounded-full bg-primary-600 text-white pl-4 pr-5 py-3.5 text-sm font-semibold shadow-lg shadow-primary-900/20 active:scale-[0.97] transition-transform print:hidden"
          style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}
          aria-label={`Call to apply: ${primaryPhone}`}
        >
          <Phone className="w-5 h-5" weight="fill" aria-hidden="true" />
          Call to apply
        </a>
      ) : null}
    </div>
  );
}

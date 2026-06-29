import Link from "next/link";
import DashboardSectionCard from "./DashboardSectionCard";
import SectionEmptyState from "@/components/providers/SectionEmptyState";
import type { ExtendedMetadata } from "@/lib/profile-completeness";
import { DEMAND_PROFILE_KEY, type DemandProfile } from "@/lib/medjobs/eligibility";
import {
  COVERAGE_OPTIONS,
  DEMAND_SHAPE_OPTIONS,
  PRN_OPTIONS,
  REQUIREMENT_OPTIONS,
  readRequirements,
} from "@/lib/medjobs/hiring-needs-questions";

/**
 * "Hire more caregivers" — the MedJobs hiring block on the provider dashboard.
 *
 * Sits last in the left column (below the directory sections). Shows the
 * provider's hiring needs (shift coverage / pattern / PRN, captured by the
 * "Initial hiring needs" modal upstream OR edited here) plus optional
 * requirements. Mirrors the standard dashboard card + edit pattern; its
 * completeness is local (NOT part of the directory completeness meter).
 */
export default function HireCaregiversCard({
  metadata,
  onEdit,
}: {
  metadata: ExtendedMetadata;
  onEdit?: () => void;
}) {
  const m = metadata as unknown as Record<string, unknown>;
  const demand = (m[DEMAND_PROFILE_KEY] ?? null) as DemandProfile | null;
  const req = readRequirements(m);

  const shifts = (demand?.coverage_buckets ?? []).map(
    (b) => COVERAGE_OPTIONS.find((o) => o.value === b)?.label ?? b,
  );
  const shapeLabel = demand?.demand_shape
    ? DEMAND_SHAPE_OPTIONS.find((o) => o.value === demand.demand_shape)?.label ?? null
    : null;
  const prnLabel = demand?.prn_open
    ? PRN_OPTIONS.find((o) => o.value === demand.prn_open)?.label ?? null
    : null;
  const reqLabels = REQUIREMENT_OPTIONS.filter((o) => req[o.key]).map((o) => o.label);

  // Local completeness (intentionally separate from the directory meter).
  const checks = [shifts.length > 0, !!shapeLabel, !!prnLabel];
  const completionPercent = Math.round((checks.filter(Boolean).length / checks.length) * 100);

  const isEmpty = !demand;

  return (
    <DashboardSectionCard
      title="Hire more caregivers"
      completionPercent={completionPercent}
      id="hire_caregivers"
      onEdit={onEdit}
    >
      <Link
        href="/medjobs/candidates"
        target="_blank"
        rel="noopener noreferrer"
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700"
      >
        more info ↗
      </Link>

      {isEmpty ? (
        <SectionEmptyState
          icon="clipboard"
          message="Tell us who you're hiring"
          subMessage="Add the shifts you need covered and any requirements — students near you will see it."
        />
      ) : (
        <div className="space-y-4 text-sm">
          {shifts.length > 0 && (
            <Row label="Shifts needed">
              <div className="flex flex-wrap gap-2">
                {shifts.map((s) => (
                  <span key={s} className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-700">{s}</span>
                ))}
              </div>
            </Row>
          )}
          {shapeLabel && <Row label="Pattern"><span className="text-gray-700">{shapeLabel}</span></Row>}
          {prnLabel && <Row label="Open to PRN"><span className="text-gray-700">{prnLabel}</span></Row>}
          {reqLabels.length > 0 && (
            <Row label="Requirements">
              <ul className="space-y-0.5 text-gray-700">
                {reqLabels.map((r) => (<li key={r}>• {r}</li>))}
              </ul>
            </Row>
          )}
        </div>
      )}
    </DashboardSectionCard>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

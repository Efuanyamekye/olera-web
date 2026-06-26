"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import { saveProfile } from "./save-profile";
import ModalFooter from "./ModalFooter";
import type { BaseEditModalProps } from "./types";
import {
  DEMAND_PROFILE_KEY,
  ELIGIBILITY_COMPLETED_KEY,
  type DemandProfile,
} from "@/lib/medjobs/eligibility";
import {
  COVERAGE_OPTIONS,
  DEMAND_SHAPE_OPTIONS,
  PRN_OPTIONS,
  REQUIREMENT_OPTIONS,
  REQUIREMENTS_KEY,
  readRequirements,
  type MedjobsRequirements,
} from "@/lib/medjobs/hiring-needs-questions";

type Shape = DemandProfile["demand_shape"];
type Prn = DemandProfile["prn_open"];
type Bucket = DemandProfile["coverage_buckets"][number];

/**
 * Edit "Hire more caregivers" — the dashboard-pattern editor for the hiring
 * block. Same shifts/pattern/PRN questions as the upfront "Initial hiring needs"
 * modal (shared defs) plus the requirement checkboxes. Saves via the standard
 * saveProfile (verify-to-save handled by the shared ModalFooter). Filling this
 * also stamps the screener-completed timestamp so a provider who arrived outside
 * the funnel is treated consistently.
 */
export default function EditHireCaregiversModal({
  profile,
  onClose,
  onSaved,
  guidedMode,
  guidedStep,
  guidedTotal,
  onGuidedBack,
  isVerified,
  onVerifyClick,
}: BaseEditModalProps) {
  const meta = (profile.metadata || {}) as Record<string, unknown>;
  const initialDemand = (meta[DEMAND_PROFILE_KEY] ?? {}) as Partial<DemandProfile>;
  const initialReq = readRequirements(meta);

  const [shape, setShape] = useState<Shape | undefined>(initialDemand.demand_shape);
  const [prn, setPrn] = useState<Prn | undefined>(initialDemand.prn_open);
  const [buckets, setBuckets] = useState<Bucket[]>(initialDemand.coverage_buckets ?? []);
  const [req, setReq] = useState<MedjobsRequirements>(initialReq);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const snapshot = (s?: Shape, p?: Prn, b?: Bucket[], r?: MedjobsRequirements) =>
    JSON.stringify({ s: s ?? null, p: p ?? null, b: [...(b ?? [])].sort(), r: r ?? {} });
  const hasChanges =
    snapshot(shape, prn, buckets, req) !==
    snapshot(initialDemand.demand_shape, initialDemand.prn_open, initialDemand.coverage_buckets, initialReq);

  const toggleBucket = (v: Bucket) =>
    setBuckets((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  const toggleReq = (k: keyof MedjobsRequirements) =>
    setReq((prev) => ({ ...prev, [k]: !prev[k] }));

  async function handleSave() {
    if (!hasChanges && !guidedMode) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const demand: Record<string, unknown> = { demand_shape: shape, prn_open: prn, coverage_buckets: buckets };
      const metadataFields: Record<string, unknown> = {
        [DEMAND_PROFILE_KEY]: demand,
        [REQUIREMENTS_KEY]: req,
      };
      // Filling the block also marks the screener complete (consistency for
      // providers who never hit the funnel screener).
      if (!meta[ELIGIBILITY_COMPLETED_KEY]) {
        metadataFields[ELIGIBILITY_COMPLETED_KEY] = new Date().toISOString();
      }
      await saveProfile({ profileId: profile.id, metadataFields, existingMetadata: meta });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const pill = (selected: boolean) =>
    `px-3.5 py-2 rounded-xl text-sm font-medium border transition-all duration-200 ${
      selected ? "bg-primary-50 border-primary-300 text-primary-700" : "bg-white border-warm-100 text-gray-900 hover:border-warm-200"
    }`;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Hire more caregivers"
      size="2xl"
      footer={
        <ModalFooter
          saving={saving}
          hasChanges={hasChanges}
          onClose={onClose}
          onSave={handleSave}
          guidedMode={guidedMode}
          guidedStep={guidedStep}
          guidedTotal={guidedTotal}
          onGuidedBack={onGuidedBack}
          showPendingVerificationNotice={
            !!profile.source_provider_id &&
            profile.verification_state !== "verified" &&
            profile.verification_state !== "not_required"
          }
        />
      }
    >
      <div className="space-y-6 pt-2">
        <Field label="Which shifts are hardest to cover?">
          <div className="flex flex-wrap gap-2">
            {COVERAGE_OPTIONS.map((o) => (
              <button key={o.value} type="button" onClick={() => toggleBucket(o.value)} className={pill(buckets.includes(o.value))}>
                {o.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="How steady are your staffing needs?">
          <div className="flex flex-wrap gap-2">
            {DEMAND_SHAPE_OPTIONS.map((o) => (
              <button key={o.value} type="button" onClick={() => setShape(o.value)} className={pill(shape === o.value)}>
                {o.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Open to PRN (on-call) students?">
          <div className="flex flex-wrap gap-2">
            {PRN_OPTIONS.map((o) => (
              <button key={o.value} type="button" onClick={() => setPrn(o.value)} className={pill(prn === o.value)}>
                {o.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Requirements (optional)">
          <div className="space-y-2">
            {REQUIREMENT_OPTIONS.map((o) => (
              <label key={o.key} className="flex items-center gap-3 text-sm text-gray-800">
                <input type="checkbox" checked={!!req[o.key]} onChange={() => toggleReq(o.key)} className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                {o.label}
              </label>
            ))}
          </div>
        </Field>

        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-base font-medium text-gray-700">{label}</p>
      {children}
    </div>
  );
}

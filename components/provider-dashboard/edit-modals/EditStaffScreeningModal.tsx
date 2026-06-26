"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import { saveProfile } from "./save-profile";
import { trackProfileEdit } from "@/lib/analytics/track-profile-edit";
import ModalFooter from "./ModalFooter";
import type { BaseEditModalProps } from "./types";

const COMMON_SCREENINGS = [
  "Background checks",
  "Drug screening",
  "Reference checks",
  "Sex offender check",
  "Training",
  "Driving record check",
  "In person interviews",
  "Residency confirmation",
  "Work eligibility",
];

export default function EditStaffScreeningModal({
  profile,
  metadata,
  onClose,
  onSaved,
  guidedMode,
  guidedStep,
  guidedTotal,
  onGuidedBack,
  isVerified,
  onVerifyClick,
}: BaseEditModalProps) {
  const initial = Array.isArray(metadata.staff_screening) ? metadata.staff_screening : [];
  const [selected, setSelected] = useState<string[]>([...initial]);
  const [customScreening, setCustomScreening] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasChanges =
    JSON.stringify([...selected].sort()) !==
    JSON.stringify([...initial].sort());

  function toggle(screening: string) {
    setSelected((prev) =>
      prev.includes(screening)
        ? prev.filter((s) => s !== screening)
        : [...prev, screening]
    );
  }

  function addCustom() {
    const trimmed = customScreening.trim();
    if (trimmed && !selected.includes(trimmed)) {
      setSelected((prev) => [...prev, trimmed]);
    }
    setCustomScreening("");
  }

  async function handleSave() {
    if (!hasChanges && !guidedMode) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveProfile({
        profileId: profile.id,
        metadataFields: { staff_screening: selected },
        existingMetadata: (profile.metadata || {}) as Record<string, unknown>,
      });
      if (hasChanges) trackProfileEdit(profile.slug, "screening");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Staff Screening"
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
      <div className="space-y-5 pt-2">
        <div className="flex flex-wrap gap-2">
          {COMMON_SCREENINGS.map((screening) => {
            const isSelected = selected.includes(screening);
            return (
              <button
                key={screening}
                type="button"
                role="checkbox"
                aria-checked={isSelected}
                onClick={() => toggle(screening)}
                className={`px-3.5 py-2 rounded-xl text-sm font-medium border transition-all duration-200 ${
                  isSelected
                    ? "bg-primary-50 border-primary-300 text-primary-700"
                    : "bg-white border-warm-100 text-gray-900 hover:border-warm-200"
                }`}
              >
                {screening}
              </button>
            );
          })}
          {/* Show custom screenings that aren't in the predefined list */}
          {selected
            .filter((s) => !COMMON_SCREENINGS.includes(s))
            .map((screening) => (
              <button
                key={screening}
                type="button"
                role="checkbox"
                aria-checked
                onClick={() => toggle(screening)}
                className="px-3.5 py-2 rounded-xl text-sm font-medium border bg-primary-50 border-primary-300 text-primary-700 transition-all duration-200"
              >
                {screening}
              </button>
            ))}
        </div>

        {/* Add custom screening */}
        <div className="space-y-1.5">
          <label htmlFor="custom-screening" className="block text-base font-medium text-gray-700">Add custom screening</label>
          <div className="relative">
            <input
              id="custom-screening"
              type="text"
              value={customScreening}
              onChange={(e) => setCustomScreening(e.target.value)}
              placeholder="e.g. CPR Certification"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustom();
                }
              }}
              className="w-full pl-4 pr-16 py-3 rounded-xl border border-gray-300 text-base placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent focus:ring-primary-500 min-h-[44px]"
            />
            <button
              type="button"
              onClick={addCustom}
              disabled={!customScreening.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Add
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}

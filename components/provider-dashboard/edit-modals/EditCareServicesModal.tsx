"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import { saveProfile } from "./save-profile";
import { trackProfileEdit } from "@/lib/analytics/track-profile-edit";
import ModalFooter from "./ModalFooter";
import type { BaseEditModalProps } from "./types";

const COMMON_SERVICES = [
  "Assisted Living",
  "Memory Care",
  "Independent Living",
  "Skilled Nursing",
  "Home Care",
  "Home Health",
  "Hospice",
  "Respite Care",
  "Adult Day Care",
  "Rehabilitation",
  "Dementia Care",
  "Personal Care",
  "Companion Care",
  "Medication Management",
  "Physical Therapy",
  "Occupational Therapy",
  "Speech Therapy",
  "Transportation",
  "Meal Preparation",
  "Housekeeping",
];

export default function EditCareServicesModal({
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
  const initialCareTypes = Array.isArray(profile.care_types) ? profile.care_types : [];
  const [selected, setSelected] = useState<string[]>([...initialCareTypes]);
  const [customService, setCustomService] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasChanges =
    JSON.stringify([...selected].sort()) !==
    JSON.stringify([...initialCareTypes].sort());

  function toggle(service: string) {
    setSelected((prev) =>
      prev.includes(service)
        ? prev.filter((s) => s !== service)
        : [...prev, service]
    );
  }

  function addCustom() {
    const trimmed = customService.trim();
    if (trimmed && !selected.includes(trimmed)) {
      setSelected((prev) => [...prev, trimmed]);
    }
    setCustomService("");
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
        topLevelFields: { care_types: selected },
        existingMetadata: (profile.metadata || {}) as Record<string, unknown>,
      });
      if (hasChanges) trackProfileEdit(profile.slug, "services");
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
      title="Care Services"
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
          {COMMON_SERVICES.map((service) => {
            const isSelected = selected.includes(service);
            return (
              <button
                key={service}
                type="button"
                role="checkbox"
                aria-checked={isSelected}
                onClick={() => toggle(service)}
                className={`px-3.5 py-2 rounded-xl text-sm font-medium border transition-all duration-200 ${
                  isSelected
                    ? "bg-primary-50 border-primary-300 text-primary-700"
                    : "bg-white border-warm-100 text-gray-900 hover:border-warm-200"
                }`}
              >
                {service}
              </button>
            );
          })}
          {/* Show custom services that aren't in the predefined list */}
          {selected
            .filter((s) => !COMMON_SERVICES.includes(s))
            .map((service) => (
              <button
                key={service}
                type="button"
                role="checkbox"
                aria-checked
                onClick={() => toggle(service)}
                className="px-3.5 py-2 rounded-xl text-sm font-medium border bg-primary-50 border-primary-300 text-primary-700 transition-all duration-200"
              >
                {service}
              </button>
            ))}
        </div>

        {/* Add custom service */}
        <div className="space-y-1.5">
          <label htmlFor="custom-service" className="block text-base font-medium text-gray-700">Add custom service</label>
          <div className="relative">
            <input
              id="custom-service"
              type="text"
              value={customService}
              onChange={(e) => setCustomService(e.target.value)}
              placeholder="e.g. Pet Therapy"
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
              disabled={!customService.trim()}
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

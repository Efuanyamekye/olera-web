"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import { saveProfile } from "./save-profile";
import { trackProfileEdit } from "@/lib/analytics/track-profile-edit";
import ModalFooter from "./ModalFooter";
import type { BaseEditModalProps } from "./types";

const PAYMENT_GROUPS = [
  {
    label: "Government & Insurance",
    options: [
      "Medicare",
      "Medicaid",
      "VA Benefits",
      "TRICARE",
      "PACE",
      "HCBS Waivers",
      "Long-Term Care Insurance",
      "Private Health Insurance",
      "Medigap",
    ],
  },
  {
    label: "Payment Methods",
    options: [
      "Private Pay",
      "Credit Card",
      "Check",
      "Wire Transfer",
      "ACH / Bank Transfer",
    ],
  },
  {
    label: "Assistance Programs",
    options: [
      "Sliding Scale",
      "State-Funded Programs",
      "Workers' Compensation",
    ],
  },
];

const ALL_OPTIONS = PAYMENT_GROUPS.flatMap((g) => g.options);

export default function EditPaymentModal({
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
  // Merge legacy booleans into the array for backwards compatibility
  const initial = [...(Array.isArray(metadata.accepted_payments) ? metadata.accepted_payments : [])];
  if (metadata.accepts_medicare && !initial.includes("Medicare")) initial.push("Medicare");
  if (metadata.accepts_medicaid && !initial.includes("Medicaid")) initial.push("Medicaid");

  const [selected, setSelected] = useState<string[]>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasChanges =
    JSON.stringify([...selected].sort()) !==
    JSON.stringify([...initial].sort());

  function toggle(method: string) {
    setSelected((prev) =>
      prev.includes(method)
        ? prev.filter((p) => p !== method)
        : [...prev, method]
    );
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
        metadataFields: {
          accepted_payments: selected,
          // Clear legacy booleans so they don't drift
          accepts_medicare: selected.includes("Medicare"),
          accepts_medicaid: selected.includes("Medicaid"),
        },
        existingMetadata: (profile.metadata || {}) as Record<string, unknown>,
      });
      if (hasChanges) trackProfileEdit(profile.slug, "payment");
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
      title="Accepted Payments & Insurance"
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
        {PAYMENT_GROUPS.map((group) => (
          <div key={group.label}>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              {group.label}
            </label>
            <div className="flex flex-wrap gap-2">
              {group.options.map((method) => {
                const isSelected = selected.includes(method);
                return (
                  <button
                    key={method}
                    type="button"
                    role="checkbox"
                    aria-checked={isSelected}
                    onClick={() => toggle(method)}
                    className={`px-3.5 py-2 rounded-xl text-sm font-medium border transition-all duration-200 ${
                      isSelected
                        ? "bg-primary-50 border-primary-300 text-primary-700"
                        : "bg-white border-warm-100 text-gray-900 hover:border-warm-200"
                    }`}
                  >
                    {method}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Show any custom entries not in predefined groups */}
        {selected.filter((s) => !ALL_OPTIONS.includes(s)).length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Other
            </label>
            <div className="flex flex-wrap gap-2">
              {selected
                .filter((s) => !ALL_OPTIONS.includes(s))
                .map((method) => (
                  <button
                    key={method}
                    type="button"
                    role="checkbox"
                    aria-checked
                    onClick={() => toggle(method)}
                    className="px-3.5 py-2 rounded-xl text-sm font-medium border bg-primary-50 border-primary-300 text-primary-700 transition-all duration-200"
                  >
                    {method}
                  </button>
                ))}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}

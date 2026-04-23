"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import { saveProfile } from "./save-profile";
import ModalFooter from "./ModalFooter";
import type { BaseEditModalProps } from "./types";

export default function EditAboutModal({
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
  const [description, setDescription] = useState(profile.description || "");
  const [yearFounded, setYearFounded] = useState(
    metadata.year_founded ? String(metadata.year_founded) : ""
  );
  const [bedCount, setBedCount] = useState(
    metadata.bed_count ? String(metadata.bed_count) : ""
  );
  const [staffCount, setStaffCount] = useState(
    metadata.staff_count ? String(metadata.staff_count) : ""
  );
  const [licenseNumber, setLicenseNumber] = useState(
    metadata.license_number || ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasChanges =
    description !== (profile.description || "") ||
    yearFounded !== (metadata.year_founded ? String(metadata.year_founded) : "") ||
    bedCount !== (metadata.bed_count ? String(metadata.bed_count) : "") ||
    staffCount !== (metadata.staff_count ? String(metadata.staff_count) : "") ||
    licenseNumber !== (metadata.license_number || "");

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
        topLevelFields: { description: description || null },
        metadataFields: {
          year_founded: yearFounded ? Number(yearFounded) : undefined,
          bed_count: bedCount ? Number(bedCount) : undefined,
          staff_count: staffCount ? Number(staffCount) : undefined,
          license_number: licenseNumber || undefined,
        },
        existingMetadata: (profile.metadata || {}) as Record<string, unknown>,
      });
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
      title="Edit About"
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
          isVerified={isVerified}
          onVerifyClick={onVerifyClick}
        />
      }
    >
      <div className="space-y-5 pt-2">
        <Input
          as="textarea"
          label="Description"
          value={description}
          onChange={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
          rows={4}
          placeholder="Tell families what makes your organization special..."
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Year Founded"
            type="number"
            value={yearFounded}
            onChange={(e) => setYearFounded((e.target as HTMLInputElement).value)}
            placeholder="e.g. 2005"
          />
          <Input
            label="License Number"
            value={licenseNumber}
            onChange={(e) => setLicenseNumber((e.target as HTMLInputElement).value)}
            placeholder="e.g. AL-12345"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Bed Count"
            type="number"
            value={bedCount}
            onChange={(e) => setBedCount((e.target as HTMLInputElement).value)}
            placeholder="e.g. 48"
          />
          <Input
            label="Staff Count"
            type="number"
            value={staffCount}
            onChange={(e) => setStaffCount((e.target as HTMLInputElement).value)}
            placeholder="e.g. 25"
          />
        </div>
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}

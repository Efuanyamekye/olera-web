"use client";

import { useState } from "react";
import type { ProfileCategory } from "@/lib/types";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { saveProfile } from "./save-profile";
import ModalFooter from "./ModalFooter";
import type { BaseEditModalProps } from "./types";

const CATEGORY_OPTIONS: { value: ProfileCategory; label: string }[] = [
  { value: "home_care_agency", label: "Home Care Agency" },
  { value: "home_health_agency", label: "Home Health Agency" },
  { value: "hospice_agency", label: "Hospice Agency" },
  { value: "independent_living", label: "Independent Living" },
  { value: "assisted_living", label: "Assisted Living" },
  { value: "memory_care", label: "Memory Care" },
  { value: "nursing_home", label: "Nursing Home" },
  { value: "inpatient_hospice", label: "Inpatient Hospice" },
  { value: "rehab_facility", label: "Rehabilitation Facility" },
  { value: "adult_day_care", label: "Adult Day Care" },
  { value: "wellness_center", label: "Wellness Center" },
  { value: "private_caregiver", label: "Private Caregiver" },
];

export default function EditOverviewModal({
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
  const [displayName, setDisplayName] = useState(profile.display_name || "");
  const [category, setCategory] = useState<string>(profile.category || "");
  const [address, setAddress] = useState(profile.address || "");
  const [city, setCity] = useState(profile.city || "");
  const [state, setState] = useState(profile.state || "");
  const [zip, setZip] = useState(profile.zip || "");
  const [phone, setPhone] = useState(profile.phone || "");
  const [email, setEmail] = useState(profile.email || "");
  const [website, setWebsite] = useState(profile.website || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasChanges =
    displayName !== (profile.display_name || "") ||
    category !== (profile.category || "") ||
    address !== (profile.address || "") ||
    city !== (profile.city || "") ||
    state !== (profile.state || "") ||
    zip !== (profile.zip || "") ||
    phone !== (profile.phone || "") ||
    email !== (profile.email || "") ||
    website !== (profile.website || "");

  async function handleSave() {
    if (!displayName.trim()) {
      setError("Display name is required");
      return;
    }
    if (!hasChanges && !guidedMode) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveProfile({
        profileId: profile.id,
        topLevelFields: {
          display_name: displayName.trim(),
          category: category || null,
          address: address || null,
          city: city || null,
          state: state || null,
          zip: zip || null,
          phone: phone || null,
          email: email || null,
          website: website || null,
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
      title="Edit Profile Overview"
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
          label="Organization Name"
          value={displayName}
          onChange={(e) => setDisplayName((e.target as HTMLInputElement).value)}
          placeholder="Your organization name"
        />

        <Select
          label="Category"
          options={CATEGORY_OPTIONS}
          value={category}
          onChange={setCategory}
          placeholder="Select a category"
        />

        <Input
          label="Street Address"
          value={address}
          onChange={(e) => setAddress((e.target as HTMLInputElement).value)}
          placeholder="123 Main Street"
        />

        <div className="grid grid-cols-3 gap-4">
          <Input
            label="City"
            value={city}
            onChange={(e) => setCity((e.target as HTMLInputElement).value)}
            placeholder="City"
          />
          <Input
            label="State"
            value={state}
            onChange={(e) => setState((e.target as HTMLInputElement).value)}
            placeholder="State"
          />
          <Input
            label="ZIP Code"
            value={zip}
            onChange={(e) => setZip((e.target as HTMLInputElement).value)}
            placeholder="ZIP"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone((e.target as HTMLInputElement).value)}
            placeholder="(555) 123-4567"
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail((e.target as HTMLInputElement).value)}
            placeholder="contact@example.com"
          />
        </div>

        <Input
          label="Website"
          type="url"
          value={website}
          onChange={(e) => setWebsite((e.target as HTMLInputElement).value)}
          placeholder="https://www.example.com"
        />

        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}

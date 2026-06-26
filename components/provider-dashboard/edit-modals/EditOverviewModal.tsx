"use client";

import { useState, useRef } from "react";
import type { ProfileCategory } from "@/lib/types";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { saveProfile } from "./save-profile";
import { trackProfileEdit } from "@/lib/analytics/track-profile-edit";
import ModalFooter from "./ModalFooter";
import type { BaseEditModalProps } from "./types";
import { useCitySearch } from "@/hooks/use-city-search";
import { useClickOutside } from "@/hooks/use-click-outside";

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

  // City picker state
  const [cityInput, setCityInput] = useState(profile.city || "");
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const cityDropdownRef = useRef<HTMLDivElement>(null);
  const { results: cityResults, preload: preloadCities } = useCitySearch(cityInput);

  useClickOutside(cityDropdownRef, () => setShowCityDropdown(false));

  const handleCitySelect = (result: { city: string; state: string; full: string }) => {
    setCity(result.city);
    setState(result.state);
    setCityInput(result.city);
    setShowCityDropdown(false);
  };

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
      if (hasChanges) trackProfileEdit(profile.slug, "overview");
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
          showPendingVerificationNotice={
            !!profile.source_provider_id &&
            profile.verification_state !== "verified" &&
            profile.verification_state !== "not_required"
          }
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

        {/* City/State/ZIP - City on own row on mobile, proportional grid on desktop */}
        <div className="space-y-4 sm:space-y-0 sm:grid sm:grid-cols-[2fr_1fr_1fr] sm:gap-4">
          {/* City picker with autocomplete */}
          <div className="relative" ref={cityDropdownRef}>
            <label htmlFor="city" className="block text-[13px] font-semibold text-gray-700 mb-1.5">
              City
            </label>
            <div className="relative">
              <input
                id="city"
                type="text"
                value={cityInput}
                onChange={(e) => {
                  setCityInput(e.target.value);
                  setCity(e.target.value);
                  setShowCityDropdown(true);
                }}
                onFocus={() => {
                  preloadCities();
                  setShowCityDropdown(true);
                }}
                placeholder="Start typing a city..."
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 hover:border-gray-300 text-base placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 transition-colors duration-200"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </div>

            {/* City dropdown */}
            {showCityDropdown && cityResults.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-48 overflow-y-auto">
                {cityResults.map((result, index) => (
                  <button
                    key={`${result.city}-${result.state}-${index}`}
                    type="button"
                    onClick={() => handleCitySelect(result)}
                    className="w-full px-4 py-2.5 text-left text-base text-gray-900 hover:bg-gray-50 transition-colors first:rounded-t-lg last:rounded-b-lg flex items-center gap-2"
                  >
                    <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>{result.full}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* State/ZIP row on mobile */}
          <div className="grid grid-cols-2 gap-4 sm:contents">
            {/* State - editable, but auto-populated from city selection */}
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

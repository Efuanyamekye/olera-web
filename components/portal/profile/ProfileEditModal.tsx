"use client";

import { useState, useRef, useCallback, type ChangeEvent } from "react";
import Image from "next/image";
import Modal from "@/components/ui/Modal";
import ModalFooter from "@/components/provider-dashboard/edit-modals/ModalFooter";
import Input from "@/components/ui/Input";
import type { BusinessProfile, FamilyMetadata } from "@/lib/types";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

// ── Options ──

const CONTACT_METHODS = ["Call", "Text", "Email"] as const;
const CARE_RECIPIENTS = ["Myself", "My parent", "My spouse", "Someone else"];
const CARE_TYPES = [
  "Home Care", "Home Health Care", "Assisted Living", "Memory Care",
  "Nursing Home", "Independent Living", "Hospice Care", "Adult Day Care",
  "Rehabilitation", "Private Caregiver",
];
const TIMELINES = [
  { value: "immediate", label: "As soon as possible" },
  { value: "within_1_month", label: "Within a month" },
  { value: "within_3_months", label: "In a few months" },
  { value: "exploring", label: "Just researching" },
];
const PAYMENT_OPTIONS = [
  "Medicare", "Medicaid", "Private insurance", "Private pay",
  "Veterans benefits", "Long-term care insurance", "I'm not sure",
];
const CARE_NEED_OPTIONS = [
  "Personal Care", "Household Tasks", "Health Management",
  "Companionship", "Financial Help", "Memory Care", "Mobility Help",
];
const SCHEDULE_OPTIONS = [
  "Mornings", "Afternoons", "Evenings", "Overnight", "Full-time", "Flexible",
];

// ── Types ──

export type ProfileSection = "overview" | "contact" | "care" | "payment";

interface ProfileEditModalProps {
  profile: BusinessProfile;
  userEmail?: string;
  section: ProfileSection;
  onClose: () => void;
  onSaved: () => void;
}

const SECTION_TITLES: Record<ProfileSection, string> = {
  overview: "Edit Profile",
  contact: "Contact Information",
  care: "Care Preferences",
  payment: "Payment & Benefits",
};

export default function ProfileEditModal({
  profile,
  userEmail,
  section,
  onClose,
  onSaved,
}: ProfileEditModalProps) {
  const meta = (profile.metadata || {}) as FamilyMetadata;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Overview fields
  const [displayName, setDisplayName] = useState(profile.display_name || "");
  const [country, setCountry] = useState(meta.country || "");
  const [city, setCity] = useState(profile.city || "");
  const [state, setState] = useState(profile.state || "");
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState("");
  const [localImageUrl, setLocalImageUrl] = useState(profile.image_url || "");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Contact fields
  const [email, setEmail] = useState(profile.email || userEmail || "");
  const [phone, setPhone] = useState(profile.phone || "");
  const [contactPref, setContactPref] = useState<string>(meta.contact_preference || "");

  // Care fields
  const [careRecipient, setCareRecipient] = useState(meta.relationship_to_recipient || "");
  const [age, setAge] = useState(meta.age ? String(meta.age) : "");
  const [careTypes, setCareTypes] = useState<string[]>(profile.care_types || []);
  const [careNeeds, setCareNeeds] = useState<string[]>(meta.care_needs || []);
  const [timeline, setTimeline] = useState(meta.timeline || "");
  const [schedule, setSchedule] = useState(meta.schedule_preference || "");
  const [notes, setNotes] = useState(profile.description || "");

  // Payment fields
  const [payments, setPayments] = useState<string[]>(meta.payment_methods || []);
  const [savedBenefits, setSavedBenefits] = useState<string[]>(meta.saved_benefits || []);

  const handleRemoveBenefit = (benefit: string) => {
    setSavedBenefits((prev) => prev.filter((b) => b !== benefit));
  };

  const handleImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageError("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setImageError("Please upload a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError("Image must be under 5MB.");
      return;
    }
    setImageUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("profileId", profile.id);
      formData.append("setAsProfilePhoto", "true");
      const res = await fetch("/api/profile/upload-image", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json();
        setImageError(data.error || "Upload failed.");
        return;
      }
      const data = await res.json();
      setLocalImageUrl(data.url || profile.image_url);
    } catch {
      setImageError("Failed to upload image. Please try again.");
    } finally {
      setImageUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSave = useCallback(async () => {
    if (!isSupabaseConfigured() || !profile) return;
    setSaving(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data: current } = await supabase
        .from("business_profiles")
        .select("metadata")
        .eq("id", profile.id)
        .single();

      const existingMeta = (current?.metadata || {}) as Record<string, unknown>;

      let updates: Record<string, unknown> = {};
      let metaUpdates: Record<string, unknown> = {};

      switch (section) {
        case "overview":
          updates = {
            display_name: displayName || null,
            city: city || null,
            state: state || null,
          };
          metaUpdates = {
            country: country || undefined,
          };
          break;

        case "contact":
          updates = {
            email: email || null,
            phone: phone || null,
          };
          metaUpdates = {
            contact_preference: contactPref || undefined,
          };
          break;

        case "care":
          updates = {
            care_types: careTypes,
            description: notes || null,
          };
          metaUpdates = {
            relationship_to_recipient: careRecipient || undefined,
            age: age ? Number(age) : undefined,
            care_needs: careNeeds.length > 0 ? careNeeds : undefined,
            timeline: timeline || undefined,
            schedule_preference: schedule || undefined,
          };
          break;

        case "payment":
          metaUpdates = {
            payment_methods: payments.length > 0 ? payments : undefined,
            saved_benefits: savedBenefits.length > 0 ? savedBenefits : undefined,
          };
          break;
      }

      await supabase
        .from("business_profiles")
        .update({
          ...updates,
          metadata: { ...existingMeta, ...metaUpdates },
        })
        .eq("id", profile.id);

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }, [
    profile, section, displayName, country, city, state,
    email, phone, contactPref, careRecipient, age, careTypes,
    careNeeds, timeline, schedule, notes, payments, onSaved,
  ]);

  const renderPill = (
    label: string,
    isSelected: boolean,
    onClick: () => void
  ) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      className={[
        "px-3.5 py-2.5 rounded-xl text-sm font-medium border transition-all duration-200",
        isSelected
          ? "bg-primary-50 border-primary-300 text-primary-700"
          : "bg-white border-warm-100 text-gray-900 hover:border-warm-200",
      ].join(" ")}
    >
      {label}
    </button>
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={SECTION_TITLES[section]}
      size="2xl"
      footer={
        <ModalFooter
          saving={saving}
          hasChanges={true}
          onClose={onClose}
          onSave={handleSave}
        />
      }
    >
      <div className="space-y-5 pt-2 pb-2">
        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        {/* ── Overview Section ── */}
        {section === "overview" && (
          <div className="space-y-5">
            {/* Photo upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Profile photo
              </label>
              <div className="flex items-center gap-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImageUpload}
                  className="hidden"
                  disabled={imageUploading}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={imageUploading}
                  className="w-20 h-20 rounded-full overflow-hidden bg-gray-50 ring-[3px] ring-gray-100 hover:ring-warm-200 shadow-xs hover:shadow-sm transition-all cursor-pointer flex items-center justify-center group relative shrink-0"
                >
                  {localImageUrl ? (
                    <>
                      <Image
                        src={localImageUrl}
                        alt={profile.display_name || "Profile"}
                        width={80}
                        height={80}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all rounded-full flex flex-col items-center justify-center gap-0.5">
                        <svg
                          className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                        <span className="text-[10px] font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity">
                          Change
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-0.5 text-gray-400 group-hover:text-gray-600 transition-colors">
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                      <span className="text-[9px] font-medium">Add</span>
                    </div>
                  )}
                  {imageUploading && (
                    <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded-full">
                      <div className="w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </button>
                <div className="text-sm text-gray-500">
                  <p className="font-medium text-gray-700">
                    {localImageUrl ? "Change photo" : "Add a photo"}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    JPEG, PNG, or WebP. Max 5MB.
                  </p>
                </div>
              </div>
              {imageError && (
                <p className="text-sm text-red-600 mt-2">{imageError}</p>
              )}
            </div>

            <Input
              label="Display name"
              value={displayName}
              onChange={(e) => setDisplayName((e.target as HTMLInputElement).value)}
              placeholder="Your full name"
            />

            <Input
              label="Country"
              value={country}
              onChange={(e) => setCountry((e.target as HTMLInputElement).value)}
              placeholder="e.g. United States, Ghana"
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="City"
                value={city}
                onChange={(e) => setCity((e.target as HTMLInputElement).value)}
                placeholder="e.g. Houston"
              />
              <Input
                label="State / Region"
                value={state}
                onChange={(e) => setState((e.target as HTMLInputElement).value)}
                placeholder="e.g. TX"
              />
            </div>
          </div>
        )}

        {/* ── Contact Section ── */}
        {section === "contact" && (
          <div className="space-y-5">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail((e.target as HTMLInputElement).value)}
              placeholder="your@email.com"
            />

            <Input
              label="Phone number"
              type="tel"
              value={phone}
              onChange={(e) => setPhone((e.target as HTMLInputElement).value)}
              placeholder="(555) 123-4567"
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2.5">
                How would you like providers to contact you?
              </label>
              <div className="flex flex-wrap gap-2">
                {CONTACT_METHODS.map((m) =>
                  renderPill(m, contactPref === m.toLowerCase(), () =>
                    setContactPref(m.toLowerCase())
                  )
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Care Preferences Section ── */}
        {section === "care" && (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2.5">
                Who needs care?
              </label>
              <div className="flex flex-wrap gap-2">
                {CARE_RECIPIENTS.map((r) =>
                  renderPill(r, careRecipient === r, () => setCareRecipient(r))
                )}
              </div>
            </div>

            <Input
              label="Age of person needing care"
              type="number"
              value={age}
              onChange={(e) => setAge((e.target as HTMLInputElement).value)}
              placeholder="e.g. 72"
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2.5">
                Type of care needed
              </label>
              <div className="flex flex-wrap gap-1.5">
                {CARE_TYPES.map((ct) =>
                  renderPill(ct, careTypes.includes(ct), () =>
                    setCareTypes((prev) =>
                      prev.includes(ct)
                        ? prev.filter((x) => x !== ct)
                        : [...prev, ct]
                    )
                  )
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2.5">
                Care needs
              </label>
              <div className="flex flex-wrap gap-1.5">
                {CARE_NEED_OPTIONS.map((need) =>
                  renderPill(need, careNeeds.includes(need), () =>
                    setCareNeeds((prev) =>
                      prev.includes(need)
                        ? prev.filter((x) => x !== need)
                        : [...prev, need]
                    )
                  )
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2.5">
                How soon do you need care?
              </label>
              <div className="flex flex-wrap gap-2">
                {TIMELINES.map((t) =>
                  renderPill(t.label, timeline === t.value, () =>
                    setTimeline(t.value)
                  )
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2.5">
                Schedule preference
              </label>
              <div className="flex flex-wrap gap-2">
                {SCHEDULE_OPTIONS.map((opt) =>
                  renderPill(opt, schedule === opt, () => setSchedule(opt))
                )}
              </div>
            </div>

            <Input
              as="textarea"
              label="Additional notes"
              value={notes}
              onChange={(e) => setNotes((e.target as HTMLTextAreaElement).value)}
              placeholder="Any details about the care situation..."
              rows={3}
            />
          </div>
        )}

        {/* ── Payment Section ── */}
        {section === "payment" && (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2.5">
                Payment methods
              </label>
              <div className="flex flex-wrap gap-2">
                {PAYMENT_OPTIONS.map((opt) =>
                  renderPill(opt, payments.includes(opt), () =>
                    setPayments((prev) =>
                      prev.includes(opt)
                        ? prev.filter((x) => x !== opt)
                        : [...prev, opt]
                    )
                  )
                )}
              </div>
            </div>

            {savedBenefits.length > 0 && (
              <div className="px-4 py-3.5 rounded-xl border border-gray-200/80 bg-warm-50/30">
                <p className="text-sm font-medium text-gray-600 mb-2">
                  Saved from Benefits Finder
                </p>
                <div className="flex flex-wrap gap-2">
                  {savedBenefits.map((benefit) => (
                    <span
                      key={benefit}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-gray-50 text-gray-600 border border-gray-200"
                    >
                      {benefit}
                      <button
                        type="button"
                        onClick={() => handleRemoveBenefit(benefit)}
                        className="w-4 h-4 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition-colors shrink-0"
                        aria-label={`Remove ${benefit}`}
                      >
                        <svg className="w-2.5 h-2.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

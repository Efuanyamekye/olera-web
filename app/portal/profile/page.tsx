"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type {
  ProfileCategory,
  OrganizationMetadata,
  CaregiverMetadata,
  FamilyMetadata,
} from "@/lib/types";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

const ORG_CATEGORIES: { value: ProfileCategory; label: string }[] = [
  { value: "assisted_living", label: "Assisted Living" },
  { value: "independent_living", label: "Independent Living" },
  { value: "memory_care", label: "Memory Care" },
  { value: "nursing_home", label: "Nursing Home / Skilled Nursing" },
  { value: "home_care_agency", label: "Home Care Agency" },
  { value: "home_health_agency", label: "Home Health Agency" },
  { value: "hospice_agency", label: "Hospice" },
  { value: "inpatient_hospice", label: "Inpatient Hospice" },
  { value: "rehab_facility", label: "Rehabilitation Facility" },
  { value: "adult_day_care", label: "Adult Day Care" },
  { value: "wellness_center", label: "Wellness Center" },
];

const CARE_TYPES = [
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
];

const COMMON_AMENITIES = [
  "24/7 Staff",
  "Activities Program",
  "Beauty Salon",
  "Chapel",
  "Dining Room",
  "Fitness Center",
  "Garden",
  "Library",
  "Pet Friendly",
  "Physical Therapy",
  "Private Rooms",
  "Secure Memory Unit",
  "Transportation",
  "WiFi",
];

const COMMON_CERTIFICATIONS = [
  "CNA",
  "HHA",
  "LPN",
  "RN",
  "CPR/First Aid",
  "Alzheimer's Certified",
  "Hospice Certified",
  "Medication Administration",
];

const COMMON_LANGUAGES = [
  "English",
  "Spanish",
  "Mandarin",
  "Cantonese",
  "Vietnamese",
  "Korean",
  "Tagalog",
  "French",
  "Haitian Creole",
  "Portuguese",
];

const TIMELINE_OPTIONS = [
  { value: "immediate", label: "Immediate" },
  { value: "within_1_month", label: "Within 1 month" },
  { value: "within_3_months", label: "Within 3 months" },
  { value: "exploring", label: "Just exploring" },
];

interface FormData {
  display_name: string;
  description: string;
  category: ProfileCategory | "";
  phone: string;
  email: string;
  website: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  care_types: string[];
}

interface OrgMeta {
  license_number: string;
  year_founded: string;
  bed_count: string;
  staff_count: string;
  accepts_medicaid: boolean;
  accepts_medicare: boolean;
  amenities: string[];
  hours: string;
  price_range: string;
}

interface CaregiverMeta {
  hourly_rate_min: string;
  hourly_rate_max: string;
  certifications: string[];
  years_experience: string;
  languages: string[];
  availability: string;
}

interface FamilyMeta {
  timeline: string;
  relationship_to_recipient: string;
  budget_min: string;
  budget_max: string;
}

export default function PortalProfilePage() {
  const { activeProfile, refreshAccountData } = useAuth();
  const [form, setForm] = useState<FormData>({
    display_name: "",
    description: "",
    category: "",
    phone: "",
    email: "",
    website: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    care_types: [],
  });
  const [orgMeta, setOrgMeta] = useState<OrgMeta>({
    license_number: "",
    year_founded: "",
    bed_count: "",
    staff_count: "",
    accepts_medicaid: false,
    accepts_medicare: false,
    amenities: [],
    hours: "",
    price_range: "",
  });
  const [caregiverMeta, setCaregiverMeta] = useState<CaregiverMeta>({
    hourly_rate_min: "",
    hourly_rate_max: "",
    certifications: [],
    years_experience: "",
    languages: [],
    availability: "",
  });
  const [familyMeta, setFamilyMeta] = useState<FamilyMeta>({
    timeline: "",
    relationship_to_recipient: "",
    budget_min: "",
    budget_max: "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Image upload state
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pre-fill form from active profile
  useEffect(() => {
    if (!activeProfile) return;

    setImageUrl(activeProfile.image_url || null);
    setForm({
      display_name: activeProfile.display_name || "",
      description: activeProfile.description || "",
      category: activeProfile.category || "",
      phone: activeProfile.phone || "",
      email: activeProfile.email || "",
      website: activeProfile.website || "",
      address: activeProfile.address || "",
      city: activeProfile.city || "",
      state: activeProfile.state || "",
      zip: activeProfile.zip || "",
      care_types: activeProfile.care_types || [],
    });

    const meta = activeProfile.metadata || {};

    if (activeProfile.type === "organization") {
      const m = meta as OrganizationMetadata;
      setOrgMeta({
        license_number: m.license_number || "",
        year_founded: m.year_founded ? String(m.year_founded) : "",
        bed_count: m.bed_count ? String(m.bed_count) : "",
        staff_count: m.staff_count ? String(m.staff_count) : "",
        accepts_medicaid: m.accepts_medicaid || false,
        accepts_medicare: m.accepts_medicare || false,
        amenities: m.amenities || [],
        hours: m.hours || "",
        price_range: m.price_range || "",
      });
    } else if (activeProfile.type === "caregiver") {
      const m = meta as CaregiverMetadata;
      setCaregiverMeta({
        hourly_rate_min: m.hourly_rate_min ? String(m.hourly_rate_min) : "",
        hourly_rate_max: m.hourly_rate_max ? String(m.hourly_rate_max) : "",
        certifications: m.certifications || [],
        years_experience: m.years_experience
          ? String(m.years_experience)
          : "",
        languages: m.languages || [],
        availability: m.availability || "",
      });
    } else if (activeProfile.type === "family") {
      const m = meta as FamilyMetadata;
      setFamilyMeta({
        timeline: m.timeline || "",
        relationship_to_recipient: m.relationship_to_recipient || "",
        budget_min: m.budget_min ? String(m.budget_min) : "",
        budget_max: m.budget_max ? String(m.budget_max) : "",
      });
    }
  }, [activeProfile]);

  // activeProfile is guaranteed by the portal layout guard
  if (!activeProfile) return null;

  const handleChange = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleCareTypeToggle = (careType: string) => {
    setForm((prev) => {
      const current = prev.care_types;
      const updated = current.includes(careType)
        ? current.filter((ct) => ct !== careType)
        : [...current, careType];
      return { ...prev, care_types: updated };
    });
    setSaved(false);
  };

  const handleToggleList = (
    list: string[],
    setList: (items: string[]) => void,
    item: string
  ) => {
    const updated = list.includes(item)
      ? list.filter((i) => i !== item)
      : [...list, item];
    setList(updated);
    setSaved(false);
  };

  const buildMetadata = (): Record<string, unknown> => {
    if (activeProfile.type === "organization") {
      const m: Record<string, unknown> = {};
      if (orgMeta.license_number) m.license_number = orgMeta.license_number;
      if (orgMeta.year_founded) m.year_founded = parseInt(orgMeta.year_founded);
      if (orgMeta.bed_count) m.bed_count = parseInt(orgMeta.bed_count);
      if (orgMeta.staff_count) m.staff_count = parseInt(orgMeta.staff_count);
      m.accepts_medicaid = orgMeta.accepts_medicaid;
      m.accepts_medicare = orgMeta.accepts_medicare;
      if (orgMeta.amenities.length > 0) m.amenities = orgMeta.amenities;
      if (orgMeta.hours) m.hours = orgMeta.hours;
      if (orgMeta.price_range) m.price_range = orgMeta.price_range;
      return m;
    }

    if (activeProfile.type === "caregiver") {
      const m: Record<string, unknown> = {};
      if (caregiverMeta.hourly_rate_min)
        m.hourly_rate_min = parseFloat(caregiverMeta.hourly_rate_min);
      if (caregiverMeta.hourly_rate_max)
        m.hourly_rate_max = parseFloat(caregiverMeta.hourly_rate_max);
      if (caregiverMeta.certifications.length > 0)
        m.certifications = caregiverMeta.certifications;
      if (caregiverMeta.years_experience)
        m.years_experience = parseInt(caregiverMeta.years_experience);
      if (caregiverMeta.languages.length > 0)
        m.languages = caregiverMeta.languages;
      if (caregiverMeta.availability)
        m.availability = caregiverMeta.availability;
      return m;
    }

    if (activeProfile.type === "family") {
      const m: Record<string, unknown> = {};
      if (familyMeta.timeline) m.timeline = familyMeta.timeline;
      if (familyMeta.relationship_to_recipient)
        m.relationship_to_recipient = familyMeta.relationship_to_recipient;
      if (familyMeta.budget_min)
        m.budget_min = parseFloat(familyMeta.budget_min);
      if (familyMeta.budget_max)
        m.budget_max = parseFloat(familyMeta.budget_max);
      return m;
    }

    return {};
  };

  const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
  const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageError("");

    // Validate file type
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setImageError("Please upload a JPEG, PNG, or WebP image.");
      return;
    }

    // Validate file size
    if (file.size > MAX_IMAGE_SIZE) {
      setImageError("Image must be under 5MB.");
      return;
    }

    setImageUploading(true);

    try {
      if (!isSupabaseConfigured()) {
        setImageError("Storage is not configured.");
        return;
      }

      const supabase = createClient();
      const ext = file.name.split(".").pop() || "jpg";
      const fileName = `${activeProfile.id}-${Date.now()}.${ext}`;
      const filePath = `profile-images/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("profile-images")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: true,
          contentType: file.type,
        });

      if (uploadError) {
        // Storage bucket may not exist yet — surface a clear message
        if (
          uploadError.message?.includes("not found") ||
          uploadError.message?.includes("Bucket")
        ) {
          setImageError(
            "Image storage is not configured yet. This feature requires a Supabase Storage bucket to be created. Please contact your developer."
          );
        } else {
          setImageError(`Upload failed: ${uploadError.message}`);
        }
        return;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("profile-images")
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;

      // Update profile with new image URL
      const { error: updateError } = await supabase
        .from("business_profiles")
        .update({ image_url: publicUrl })
        .eq("id", activeProfile.id);

      if (updateError) throw updateError;

      setImageUrl(publicUrl);
      await refreshAccountData();
    } catch (err) {
      console.error("Image upload error:", err);
      setImageError("Failed to upload image. Please try again.");
    } finally {
      setImageUploading(false);
      // Reset the input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveImage = async () => {
    if (!imageUrl || !isSupabaseConfigured()) return;

    setImageUploading(true);
    setImageError("");

    try {
      const supabase = createClient();

      // Clear image_url from profile
      const { error: updateError } = await supabase
        .from("business_profiles")
        .update({ image_url: null })
        .eq("id", activeProfile.id);

      if (updateError) throw updateError;

      setImageUrl(null);
      await refreshAccountData();
    } catch (err) {
      console.error("Remove image error:", err);
      setImageError("Failed to remove image. Please try again.");
    } finally {
      setImageUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupabaseConfigured()) return;

    setSaving(true);
    setError("");

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("business_profiles")
        .update({
          display_name: form.display_name,
          description: form.description || null,
          category: form.category || null,
          phone: form.phone || null,
          email: form.email || null,
          website: form.website || null,
          address: form.address || null,
          city: form.city || null,
          state: form.state || null,
          zip: form.zip || null,
          care_types: form.care_types,
          metadata: buildMetadata(),
        })
        .eq("id", activeProfile.id);

      if (updateError) throw updateError;

      await refreshAccountData();
      setSaved(true);
    } catch (err) {
      console.error("Profile update error:", err);
      setError("Failed to save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const isOrg = activeProfile.type === "organization";
  const isCaregiver = activeProfile.type === "caregiver";
  const isFamily = activeProfile.type === "family";

  const profileLabel = isOrg
    ? "Keep your information up to date so families can find you."
    : isCaregiver
    ? "Keep your information up to date so agencies and families can find you."
    : "Keep your information up to date so providers can understand your needs.";

  return (
    <div>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Edit profile</h1>
          <p className="text-lg text-gray-600 mt-1">{profileLabel}</p>
        </div>
        {activeProfile?.slug && (isOrg || isCaregiver) && (
          <a
            href={`/provider/${activeProfile.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors whitespace-nowrap"
          >
            View live profile
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        )}
      </div>

      {/* Profile image section */}
      {(isOrg || isCaregiver) && (
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Profile photo
          </h2>
          <div className="bg-white p-6 rounded-xl border border-gray-200">
            <div className="flex items-center gap-6">
              {/* Image preview */}
              <div className="relative w-24 h-24 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageUrl}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
                {imageUploading && (
                  <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>

              {/* Upload controls */}
              <div className="flex-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImageUpload}
                  className="hidden"
                  disabled={imageUploading}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={imageUploading}
                    className="px-4 py-2 text-sm font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {imageUrl ? "Change photo" : "Upload photo"}
                  </button>
                  {imageUrl && (
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      disabled={imageUploading}
                      className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  JPEG, PNG, or WebP. Max 5MB.
                </p>
                {imageError && (
                  <p className="text-xs text-red-600 mt-1">{imageError}</p>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Basic info section */}
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Basic information
          </h2>
          <div className="space-y-6 bg-white p-6 rounded-xl border border-gray-200">
            <Input
              label={isOrg ? "Organization name" : "Display name"}
              name="display_name"
              value={form.display_name}
              onChange={(e) =>
                handleChange(
                  "display_name",
                  (e.target as HTMLInputElement).value
                )
              }
              required
            />

            <Input
              label="Description"
              name="description"
              as="textarea"
              value={form.description}
              onChange={(e) =>
                handleChange(
                  "description",
                  (e.target as HTMLTextAreaElement).value
                )
              }
              placeholder={
                isFamily
                  ? "Describe the care situation and what you're looking for."
                  : "Tell families about your services, philosophy, and what makes you different."
              }
              rows={4}
            />

            {isOrg && (
              <div className="space-y-1.5">
                <label
                  htmlFor="category"
                  className="block text-base font-medium text-gray-700"
                >
                  Organization type
                </label>
                <select
                  id="category"
                  value={form.category}
                  onChange={(e) => handleChange("category", e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 text-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent min-h-[44px]"
                >
                  <option value="">Select a category</option>
                  {ORG_CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </section>

        {/* Contact section */}
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Contact information
          </h2>
          <div className="space-y-6 bg-white p-6 rounded-xl border border-gray-200">
            <Input
              label="Phone"
              name="phone"
              type="tel"
              value={form.phone}
              onChange={(e) =>
                handleChange("phone", (e.target as HTMLInputElement).value)
              }
              placeholder="(555) 123-4567"
            />
            <Input
              label="Email"
              name="email"
              type="email"
              value={form.email}
              onChange={(e) =>
                handleChange("email", (e.target as HTMLInputElement).value)
              }
              placeholder="contact@example.com"
            />
            {!isFamily && (
              <Input
                label="Website"
                name="website"
                type="url"
                value={form.website}
                onChange={(e) =>
                  handleChange("website", (e.target as HTMLInputElement).value)
                }
                placeholder="https://example.com"
              />
            )}
          </div>
        </section>

        {/* Location section */}
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Location
          </h2>
          <div className="space-y-6 bg-white p-6 rounded-xl border border-gray-200">
            {!isFamily && (
              <Input
                label="Street address"
                name="address"
                value={form.address}
                onChange={(e) =>
                  handleChange("address", (e.target as HTMLInputElement).value)
                }
                placeholder="123 Main Street"
              />
            )}
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="City"
                name="city"
                value={form.city}
                onChange={(e) =>
                  handleChange("city", (e.target as HTMLInputElement).value)
                }
              />
              <Input
                label="State"
                name="state"
                value={form.state}
                onChange={(e) =>
                  handleChange("state", (e.target as HTMLInputElement).value)
                }
              />
            </div>
            <Input
              label="ZIP code"
              name="zip"
              value={form.zip}
              onChange={(e) =>
                handleChange("zip", (e.target as HTMLInputElement).value)
              }
            />
          </div>
        </section>

        {/* Care types section */}
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            {isFamily ? "Care types needed" : "Care types offered"}
          </h2>
          <div className="bg-white p-6 rounded-xl border border-gray-200">
            <div className="flex flex-wrap gap-2">
              {CARE_TYPES.map((ct) => (
                <button
                  key={ct}
                  type="button"
                  onClick={() => handleCareTypeToggle(ct)}
                  className={[
                    "px-4 py-2 rounded-lg text-base font-medium transition-colors border min-h-[44px]",
                    form.care_types.includes(ct)
                      ? "bg-primary-50 border-primary-500 text-primary-700"
                      : "bg-white border-gray-300 text-gray-700 hover:border-gray-400",
                  ].join(" ")}
                >
                  {ct}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Organization details section */}
        {isOrg && (
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Organization details
            </h2>
            <div className="space-y-6 bg-white p-6 rounded-xl border border-gray-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <Input
                  label="License number"
                  name="license_number"
                  value={orgMeta.license_number}
                  onChange={(e) => {
                    setOrgMeta((p) => ({
                      ...p,
                      license_number: (e.target as HTMLInputElement).value,
                    }));
                    setSaved(false);
                  }}
                  placeholder="e.g. HCO-12345"
                />
                <Input
                  label="Year founded"
                  name="year_founded"
                  type="number"
                  value={orgMeta.year_founded}
                  onChange={(e) => {
                    setOrgMeta((p) => ({
                      ...p,
                      year_founded: (e.target as HTMLInputElement).value,
                    }));
                    setSaved(false);
                  }}
                  placeholder="e.g. 2005"
                />
                <Input
                  label="Bed count / capacity"
                  name="bed_count"
                  type="number"
                  value={orgMeta.bed_count}
                  onChange={(e) => {
                    setOrgMeta((p) => ({
                      ...p,
                      bed_count: (e.target as HTMLInputElement).value,
                    }));
                    setSaved(false);
                  }}
                  placeholder="e.g. 120"
                />
                <Input
                  label="Staff count"
                  name="staff_count"
                  type="number"
                  value={orgMeta.staff_count}
                  onChange={(e) => {
                    setOrgMeta((p) => ({
                      ...p,
                      staff_count: (e.target as HTMLInputElement).value,
                    }));
                    setSaved(false);
                  }}
                  placeholder="e.g. 45"
                />
              </div>

              <Input
                label="Hours of operation"
                name="hours"
                value={orgMeta.hours}
                onChange={(e) => {
                  setOrgMeta((p) => ({
                    ...p,
                    hours: (e.target as HTMLInputElement).value,
                  }));
                  setSaved(false);
                }}
                placeholder="e.g. Mon-Fri 8am-6pm, 24/7 for residents"
              />

              <Input
                label="Price range"
                name="price_range"
                value={orgMeta.price_range}
                onChange={(e) => {
                  setOrgMeta((p) => ({
                    ...p,
                    price_range: (e.target as HTMLInputElement).value,
                  }));
                  setSaved(false);
                }}
                placeholder="e.g. $3,500 - $6,000/month"
              />

              <div className="space-y-3">
                <p className="text-base font-medium text-gray-700">
                  Accepted payment types
                </p>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
                    <input
                      type="checkbox"
                      checked={orgMeta.accepts_medicare}
                      onChange={(e) => {
                        setOrgMeta((p) => ({
                          ...p,
                          accepts_medicare: e.target.checked,
                        }));
                        setSaved(false);
                      }}
                      className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-base text-gray-700">Medicare</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
                    <input
                      type="checkbox"
                      checked={orgMeta.accepts_medicaid}
                      onChange={(e) => {
                        setOrgMeta((p) => ({
                          ...p,
                          accepts_medicaid: e.target.checked,
                        }));
                        setSaved(false);
                      }}
                      className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-base text-gray-700">Medicaid</span>
                  </label>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-base font-medium text-gray-700">
                  Amenities & features
                </p>
                <div className="flex flex-wrap gap-2">
                  {COMMON_AMENITIES.map((amenity) => (
                    <button
                      key={amenity}
                      type="button"
                      onClick={() =>
                        handleToggleList(
                          orgMeta.amenities,
                          (items) =>
                            setOrgMeta((p) => ({ ...p, amenities: items })),
                          amenity
                        )
                      }
                      className={[
                        "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border min-h-[36px]",
                        orgMeta.amenities.includes(amenity)
                          ? "bg-primary-50 border-primary-500 text-primary-700"
                          : "bg-white border-gray-300 text-gray-700 hover:border-gray-400",
                      ].join(" ")}
                    >
                      {amenity}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Caregiver details section */}
        {isCaregiver && (
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Caregiver details
            </h2>
            <div className="space-y-6 bg-white p-6 rounded-xl border border-gray-200">
              <Input
                label="Years of experience"
                name="years_experience"
                type="number"
                value={caregiverMeta.years_experience}
                onChange={(e) => {
                  setCaregiverMeta((p) => ({
                    ...p,
                    years_experience: (e.target as HTMLInputElement).value,
                  }));
                  setSaved(false);
                }}
                placeholder="e.g. 5"
              />

              <div className="space-y-1.5">
                <p className="text-base font-medium text-gray-700">
                  Hourly rate range
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Minimum ($/hr)"
                    name="hourly_rate_min"
                    type="number"
                    value={caregiverMeta.hourly_rate_min}
                    onChange={(e) => {
                      setCaregiverMeta((p) => ({
                        ...p,
                        hourly_rate_min: (e.target as HTMLInputElement).value,
                      }));
                      setSaved(false);
                    }}
                    placeholder="15"
                  />
                  <Input
                    label="Maximum ($/hr)"
                    name="hourly_rate_max"
                    type="number"
                    value={caregiverMeta.hourly_rate_max}
                    onChange={(e) => {
                      setCaregiverMeta((p) => ({
                        ...p,
                        hourly_rate_max: (e.target as HTMLInputElement).value,
                      }));
                      setSaved(false);
                    }}
                    placeholder="30"
                  />
                </div>
              </div>

              <Input
                label="Availability"
                name="availability"
                value={caregiverMeta.availability}
                onChange={(e) => {
                  setCaregiverMeta((p) => ({
                    ...p,
                    availability: (e.target as HTMLInputElement).value,
                  }));
                  setSaved(false);
                }}
                placeholder="e.g. Weekdays, flexible hours"
              />

              <div className="space-y-3">
                <p className="text-base font-medium text-gray-700">
                  Certifications
                </p>
                <div className="flex flex-wrap gap-2">
                  {COMMON_CERTIFICATIONS.map((cert) => (
                    <button
                      key={cert}
                      type="button"
                      onClick={() =>
                        handleToggleList(
                          caregiverMeta.certifications,
                          (items) =>
                            setCaregiverMeta((p) => ({
                              ...p,
                              certifications: items,
                            })),
                          cert
                        )
                      }
                      className={[
                        "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border min-h-[36px]",
                        caregiverMeta.certifications.includes(cert)
                          ? "bg-primary-50 border-primary-500 text-primary-700"
                          : "bg-white border-gray-300 text-gray-700 hover:border-gray-400",
                      ].join(" ")}
                    >
                      {cert}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-base font-medium text-gray-700">
                  Languages spoken
                </p>
                <div className="flex flex-wrap gap-2">
                  {COMMON_LANGUAGES.map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() =>
                        handleToggleList(
                          caregiverMeta.languages,
                          (items) =>
                            setCaregiverMeta((p) => ({
                              ...p,
                              languages: items,
                            })),
                          lang
                        )
                      }
                      className={[
                        "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border min-h-[36px]",
                        caregiverMeta.languages.includes(lang)
                          ? "bg-primary-50 border-primary-500 text-primary-700"
                          : "bg-white border-gray-300 text-gray-700 hover:border-gray-400",
                      ].join(" ")}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Family details section */}
        {isFamily && (
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Care situation
            </h2>
            <div className="space-y-6 bg-white p-6 rounded-xl border border-gray-200">
              <div className="space-y-1.5">
                <label
                  htmlFor="timeline"
                  className="block text-base font-medium text-gray-700"
                >
                  Timeline
                </label>
                <select
                  id="timeline"
                  value={familyMeta.timeline}
                  onChange={(e) => {
                    setFamilyMeta((p) => ({
                      ...p,
                      timeline: e.target.value,
                    }));
                    setSaved(false);
                  }}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 text-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent min-h-[44px]"
                >
                  <option value="">Select timeline</option>
                  {TIMELINE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <Input
                label="Relationship to care recipient"
                name="relationship_to_recipient"
                value={familyMeta.relationship_to_recipient}
                onChange={(e) => {
                  setFamilyMeta((p) => ({
                    ...p,
                    relationship_to_recipient: (e.target as HTMLInputElement)
                      .value,
                  }));
                  setSaved(false);
                }}
                placeholder="e.g. Daughter, Spouse, Son"
              />

              <div className="space-y-1.5">
                <p className="text-base font-medium text-gray-700">
                  Budget range (per month)
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Minimum ($)"
                    name="budget_min"
                    type="number"
                    value={familyMeta.budget_min}
                    onChange={(e) => {
                      setFamilyMeta((p) => ({
                        ...p,
                        budget_min: (e.target as HTMLInputElement).value,
                      }));
                      setSaved(false);
                    }}
                    placeholder="2000"
                  />
                  <Input
                    label="Maximum ($)"
                    name="budget_max"
                    type="number"
                    value={familyMeta.budget_max}
                    onChange={(e) => {
                      setFamilyMeta((p) => ({
                        ...p,
                        budget_max: (e.target as HTMLInputElement).value,
                      }));
                      setSaved(false);
                    }}
                    placeholder="5000"
                  />
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Submit */}
        {error && (
          <div
            className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-base"
            role="alert"
          >
            {error}
          </div>
        )}

        <div className="flex items-center gap-4">
          <Button type="submit" size="lg" loading={saving}>
            {saved ? "Saved" : "Save changes"}
          </Button>
          {saved && (
            <span className="text-base text-primary-600 font-medium">
              Changes saved successfully.
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

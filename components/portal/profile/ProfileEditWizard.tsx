"use client";

import { useState, useEffect, useRef, useCallback, type ChangeEvent } from "react";
import Image from "next/image";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useCitySearch } from "@/hooks/use-city-search";
import { useClickOutside } from "@/hooks/use-click-outside";
import type { BusinessProfile, FamilyMetadata } from "@/lib/types";

// ============================================================
// Types
// ============================================================

type Step = 1 | 2 | 3 | 4;

interface ProfileEditWizardProps {
  profile: BusinessProfile;
  userEmail?: string;
  onClose: () => void;
  onSaved: () => void;
  /** Optional: start at a specific step */
  initialStep?: Step;
}

// ============================================================
// Constants
// ============================================================

const STEP_TITLES: Record<Step, string> = {
  1: "Basic Information",
  2: "Contact Details",
  3: "Care Preferences",
  4: "Payment & Benefits",
};

const STEP_SUBTITLES: Record<Step, string> = {
  1: "Tell us about yourself",
  2: "How can providers reach you?",
  3: "What kind of care do you need?",
  4: "How will you pay for care?",
};

const WHO_OPTIONS = [
  { id: "Myself", label: "Myself", icon: "user" },
  { id: "My parent", label: "My parent", icon: "parent" },
  { id: "My spouse", label: "My spouse", icon: "heart" },
  { id: "Someone else", label: "Someone else", icon: "people" },
] as const;

const CARE_TYPES = [
  "Home Care",
  "Home Health Care",
  "Assisted Living",
  "Memory Care",
  "Nursing Home",
  "Independent Living",
  "Hospice Care",
  "Adult Day Care",
] as const;

const CONTACT_METHODS = [
  { id: "call", label: "Phone call" },
  { id: "text", label: "Text message" },
  { id: "email", label: "Email" },
] as const;

const TIMELINES = [
  { value: "immediate", label: "Immediately" },
  { value: "within_1_month", label: "Within a month" },
  { value: "within_3_months", label: "In a few months" },
  { value: "exploring", label: "Just exploring" },
] as const;

const CARE_NEEDS = [
  "Personal care",
  "Household tasks",
  "Health management",
  "Companionship",
  "Memory care",
  "Mobility help",
] as const;

const SCHEDULE_OPTIONS = [
  { value: "mornings", label: "Mornings" },
  { value: "afternoons", label: "Afternoons" },
  { value: "evenings", label: "Evenings" },
  { value: "overnight", label: "Overnight" },
  { value: "full_time", label: "Full-time" },
  { value: "flexible", label: "Flexible" },
] as const;

const PAYMENT_OPTIONS = [
  "Medicare",
  "Medicaid",
  "Private insurance",
  "Private pay",
  "Veterans benefits",
  "Long-term care insurance",
] as const;

// ============================================================
// Helper Components
// ============================================================

/** Unified selection chip - used throughout for consistency */
function SelectionChip({
  selected,
  onClick,
  children,
  icon,
  size = "md",
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
  size?: "sm" | "md";
}) {
  const sizeClasses = size === "sm"
    ? "px-3 py-2 text-[13px]"
    : "px-4 py-2.5 text-sm";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        ${sizeClasses} rounded-xl font-medium transition-all duration-200
        flex items-center gap-2
        ${selected
          ? "bg-primary-600 text-white shadow-sm"
          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
        }
      `}
    >
      {icon && <span className={selected ? "text-white/90" : "text-gray-500"}>{icon}</span>}
      {children}
    </button>
  );
}

/** Section label for form groups */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[15px] font-semibold text-gray-900 mb-3">
      {children}
    </label>
  );
}

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i <= current
              ? "bg-primary-600 w-6"
              : "bg-gray-200 w-1.5"
          }`}
        />
      ))}
    </div>
  );
}

function StepNav({
  steps,
  current,
  onSelect,
}: {
  steps: { num: Step; label: string }[];
  current: Step;
  onSelect: (step: Step) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 p-1 bg-gray-100 rounded-full">
      {steps.map(({ num, label }) => (
        <button
          key={num}
          type="button"
          onClick={() => onSelect(num)}
          className={`px-3.5 py-1.5 text-[13px] font-medium rounded-full transition-all ${
            current === num
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function WhoIcon({ type, className = "w-5 h-5" }: { type: string; className?: string }) {
  switch (type) {
    case "user":
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      );
    case "parent":
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case "heart":
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      );
    case "people":
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      );
    default:
      return null;
  }
}

// ============================================================
// Main Component
// ============================================================

export default function ProfileEditWizard({
  profile,
  userEmail = "",
  onClose,
  onSaved,
  initialStep = 1,
}: ProfileEditWizardProps) {
  const { refreshAccountData } = useAuth();
  const meta = (profile.metadata || {}) as FamilyMetadata;

  // Step state
  const [step, setStep] = useState<Step>(initialStep);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Step 1: Basic Info
  const [displayName, setDisplayName] = useState(profile.display_name || "");
  const [city, setCity] = useState(profile.city || "");
  const [state, setState] = useState(profile.state || "");
  const [locationInput, setLocationInput] = useState(
    profile.city && profile.state ? `${profile.city}, ${profile.state}` : ""
  );
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const cityDropdownRef = useRef<HTMLDivElement>(null);
  const cityInputRef = useRef<HTMLInputElement>(null);
  const { results: cityResults, preload: preloadCities } = useCitySearch(locationInput);
  useClickOutside(cityDropdownRef, () => setShowCityDropdown(false));

  // Image upload
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState("");
  const [localImageUrl, setLocalImageUrl] = useState(profile.image_url || "");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2: Contact
  const [email, setEmail] = useState(profile.email || userEmail || "");
  const [phone, setPhone] = useState(profile.phone || "");
  const [contactPref, setContactPref] = useState<string>(meta.contact_preference || "");

  // Step 3: Care Preferences
  const [whoNeedsCare, setWhoNeedsCare] = useState(meta.relationship_to_recipient || "");
  const [age, setAge] = useState<string>(meta.age ? String(meta.age) : "");
  const [careTypes, setCareTypes] = useState<string[]>(profile.care_types || []);
  const [careNeeds, setCareNeeds] = useState<string[]>(meta.care_needs || []);
  const [timeline, setTimeline] = useState(meta.timeline || "");
  const [schedulePreference, setSchedulePreference] = useState(meta.schedule_preference || "");
  const [description, setDescription] = useState(meta.about_situation || profile.description || "");

  // Step 4: Payment
  const [payments, setPayments] = useState<string[]>(meta.payment_methods || []);

  // Preload cities on mount
  useEffect(() => {
    preloadCities();
  }, [preloadCities]);

  // Handle city selection
  const handleCitySelect = (cityName: string, stateCode: string) => {
    setCity(cityName);
    setState(stateCode);
    setLocationInput(`${cityName}, ${stateCode}`);
    setShowCityDropdown(false);
  };

  // Handle image upload
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

  // Toggle care type selection
  const toggleCareType = (type: string) => {
    setCareTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  // Toggle care need selection
  const toggleCareNeed = (need: string) => {
    setCareNeeds((prev) =>
      prev.includes(need) ? prev.filter((n) => n !== need) : [...prev, need]
    );
  };

  // Toggle payment option
  const togglePayment = (option: string) => {
    setPayments((prev) =>
      prev.includes(option) ? prev.filter((p) => p !== option) : [...prev, option]
    );
  };

  // Auto-save function (doesn't close modal)
  const saveChanges = useCallback(async () => {
    if (!isSupabaseConfigured() || !profile) return;
    setSaving(true);

    try {
      const supabase = createClient();
      const { data: current } = await supabase
        .from("business_profiles")
        .select("metadata")
        .eq("id", profile.id)
        .single();

      const existingMeta = (current?.metadata || {}) as Record<string, unknown>;

      // Build updated metadata - only include fields that have values
      const updatedMeta: Record<string, unknown> = { ...existingMeta };

      // Set or clear each field explicitly
      if (contactPref) updatedMeta.contact_preference = contactPref;
      if (whoNeedsCare) updatedMeta.relationship_to_recipient = whoNeedsCare;
      if (age) updatedMeta.age = parseInt(age, 10);
      if (careNeeds.length > 0) updatedMeta.care_needs = careNeeds;
      if (timeline) updatedMeta.timeline = timeline;
      if (schedulePreference) updatedMeta.schedule_preference = schedulePreference;
      if (description) updatedMeta.about_situation = description;
      if (payments.length > 0) updatedMeta.payment_methods = payments;

      const updatePayload = {
        display_name: displayName || null,
        city: city || null,
        state: state || null,
        email: email || null,
        phone: phone || null,
        care_types: careTypes,
        description: description || null,
        metadata: updatedMeta,
      };

      console.log("[ProfileEditWizard] Saving with payload:", {
        profileId: profile.id,
        description: updatePayload.description,
        aboutSituation: updatedMeta.about_situation,
      });

      const { error } = await supabase
        .from("business_profiles")
        .update(updatePayload)
        .eq("id", profile.id);

      if (error) {
        console.error("[ProfileEditWizard] Save failed:", error);
        return;
      }

      // Verify the save worked by fetching the data back
      const { data: verification, error: verifyError } = await supabase
        .from("business_profiles")
        .select("description, metadata")
        .eq("id", profile.id)
        .single();

      if (verifyError) {
        console.error("[ProfileEditWizard] Verification fetch failed:", verifyError);
      } else {
        const verifyMeta = verification?.metadata as Record<string, unknown>;
        console.log("[ProfileEditWizard] Verified saved data:", {
          description: verification?.description || "(empty)",
          aboutSituation: verifyMeta?.about_situation || "(empty)",
          savedCorrectly: verification?.description === (description || null),
        });
      }

      // Log profile enrichment event (fire-and-forget, debounced by saveChanges already)
      fetch("/api/activity/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actor_type: "family",
          profile_id: profile.id,
          event_type: "profile_enriched",
          metadata: {
            fields_set: [
              displayName && "display_name",
              city && "city",
              state && "state",
              email && "email",
              phone && "phone",
              careTypes.length > 0 && "care_types",
              careNeeds.length > 0 && "care_needs",
              whoNeedsCare && "relationship",
              age && "age",
              timeline && "timeline",
              schedulePreference && "schedule_preference",
              description && "description",
              payments.length > 0 && "payment_methods",
              contactPref && "contact_preference",
            ].filter(Boolean),
            step: step,
          },
        }),
      }).catch(() => {});

      await refreshAccountData();
    } catch (err) {
      console.error("[ProfileEditWizard] Auto-save failed:", err);
    } finally {
      setSaving(false);
    }
  }, [
    profile,
    displayName,
    city,
    state,
    email,
    phone,
    contactPref,
    whoNeedsCare,
    age,
    careTypes,
    careNeeds,
    timeline,
    schedulePreference,
    description,
    payments,
    refreshAccountData,
    step,
  ]);

  // Track if initial load is done (to prevent saving on mount)
  const initialLoadDone = useRef(false);
  useEffect(() => {
    initialLoadDone.current = true;
  }, []);

  // Debounced auto-save when any field changes
  useEffect(() => {
    if (!initialLoadDone.current) return;

    setHasChanges(true);
    const timer = setTimeout(() => {
      saveChanges();
    }, 800); // 800ms debounce

    return () => clearTimeout(timer);
  }, [
    displayName,
    city,
    state,
    email,
    phone,
    contactPref,
    whoNeedsCare,
    age,
    careTypes,
    careNeeds,
    timeline,
    schedulePreference,
    description,
    payments,
    saveChanges,
  ]);

  // Handle close - save any pending changes, then close
  const handleClose = useCallback(async () => {
    // Save immediately to capture any pending changes (debounce might not have fired yet)
    await saveChanges();
    onSaved(); // Refresh parent data
    onClose();
  }, [saveChanges, onSaved, onClose]);

  // Step validation (optional - for visual feedback)
  const isStep1Valid = displayName.trim().length > 0;
  const isStep3Valid = careTypes.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-[600px] bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
        {/* Header - minimal, Apple-style */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100/80">
          <div className="flex items-center gap-4">
            <StepNav
              steps={[
                { num: 1, label: "Info" },
                { num: 2, label: "Contact" },
                { num: 3, label: "Care" },
                { num: 4, label: "Payment" },
              ]}
              current={step}
              onSelect={setStep}
            />
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overflow-x-visible">
          <div className="px-6 py-6 lg:px-8 lg:py-8 pb-24">
            {/* Step title - cleaner hierarchy */}
            <div className="mb-8">
              <h3 className="text-2xl font-display font-bold text-gray-900 tracking-tight">
                {STEP_TITLES[step]}
              </h3>
              <p className="text-[15px] text-gray-500 mt-1">
                {STEP_SUBTITLES[step]}
              </p>
            </div>

              {/* Step 1: Basic Information */}
              {step === 1 && (
                <div className="space-y-8">
                  {/* Photo upload - centered, prominent */}
                  <div className="flex flex-col items-center">
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
                      className="w-24 h-24 rounded-full overflow-hidden bg-gray-100 hover:bg-gray-200 transition-all cursor-pointer flex items-center justify-center group relative"
                    >
                      {localImageUrl ? (
                        <>
                          <Image
                            src={localImageUrl}
                            alt={displayName || "Profile"}
                            width={96}
                            height={96}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all rounded-full flex items-center justify-center">
                            <svg
                              className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              strokeWidth={1.5}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </div>
                        </>
                      ) : (
                        <svg className="w-8 h-8 text-gray-400 group-hover:text-gray-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                        </svg>
                      )}
                      {imageUploading && (
                        <div className="absolute inset-0 bg-white/90 flex items-center justify-center rounded-full">
                          <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </button>
                    <p className="text-sm text-gray-500 mt-3">
                      {localImageUrl ? "Tap to change" : "Add a photo"}
                    </p>
                    {imageError && (
                      <p className="text-sm text-red-600 mt-1">{imageError}</p>
                    )}
                  </div>

                  {/* Name */}
                  <div>
                    <SectionLabel>Your name</SectionLabel>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Enter your full name"
                      className="w-full px-4 py-3.5 rounded-xl bg-gray-100 border-0 focus:bg-white focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-gray-900 placeholder:text-gray-400"
                    />
                  </div>

                  {/* Location */}
                  <div ref={cityDropdownRef} className="relative">
                    <SectionLabel>Location</SectionLabel>
                    <input
                      ref={cityInputRef}
                      type="text"
                      value={locationInput}
                      onChange={(e) => {
                        setLocationInput(e.target.value);
                        setShowCityDropdown(true);
                      }}
                      onFocus={() => setShowCityDropdown(true)}
                      placeholder="Search for your city..."
                      className="w-full px-4 py-3.5 rounded-xl bg-gray-100 border-0 focus:bg-white focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-gray-900 placeholder:text-gray-400"
                    />
                    {showCityDropdown && cityResults.length > 0 && (
                      <div className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                        {cityResults.map((result) => (
                          <button
                            key={`${result.city}-${result.state}`}
                            type="button"
                            onClick={() => handleCitySelect(result.city, result.state)}
                            className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors first:rounded-t-xl last:rounded-b-xl"
                          >
                            <span className="font-medium text-gray-900">{result.city}</span>
                            <span className="text-gray-500">, {result.state}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Step 2: Contact Details */}
              {step === 2 && (
                <div className="space-y-8">
                  {/* Email */}
                  <div>
                    <SectionLabel>Email address</SectionLabel>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="w-full px-4 py-3.5 rounded-xl bg-gray-100 border-0 focus:bg-white focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-gray-900 placeholder:text-gray-400"
                    />
                  </div>

                  {/* Phone */}
                  <div>
                    <SectionLabel>Phone number</SectionLabel>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(555) 123-4567"
                      className="w-full px-4 py-3.5 rounded-xl bg-gray-100 border-0 focus:bg-white focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-gray-900 placeholder:text-gray-400"
                    />
                  </div>

                  {/* Preferred contact method */}
                  <div>
                    <SectionLabel>Preferred contact method</SectionLabel>
                    <div className="flex flex-wrap gap-2">
                      {CONTACT_METHODS.map(({ id, label }) => (
                        <SelectionChip
                          key={id}
                          selected={contactPref === id}
                          onClick={() => setContactPref(id)}
                        >
                          {label}
                        </SelectionChip>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Care Preferences */}
              {step === 3 && (
                <div className="space-y-8">
                  {/* Who needs care */}
                  <div>
                    <SectionLabel>Who needs care?</SectionLabel>
                    <div className="flex flex-wrap gap-2">
                      {WHO_OPTIONS.map(({ id, label, icon }) => (
                        <SelectionChip
                          key={id}
                          selected={whoNeedsCare === id}
                          onClick={() => setWhoNeedsCare(id)}
                          icon={<WhoIcon type={icon} className="w-4 h-4" />}
                        >
                          {label}
                        </SelectionChip>
                      ))}
                    </div>
                  </div>

                  {/* Age - inline with label */}
                  <div>
                    <SectionLabel>Age of person needing care</SectionLabel>
                    <input
                      type="number"
                      min="0"
                      max="120"
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                      placeholder="Enter age"
                      className="w-full max-w-[200px] px-4 py-3.5 rounded-xl bg-gray-100 border-0 focus:bg-white focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-gray-900 placeholder:text-gray-400"
                    />
                  </div>

                  {/* Care types */}
                  <div>
                    <SectionLabel>Type of care setting</SectionLabel>
                    <div className="flex flex-wrap gap-2">
                      {CARE_TYPES.map((type) => (
                        <SelectionChip
                          key={type}
                          selected={careTypes.includes(type)}
                          onClick={() => toggleCareType(type)}
                          size="sm"
                        >
                          {type}
                        </SelectionChip>
                      ))}
                    </div>
                  </div>

                  {/* Care needs */}
                  <div>
                    <SectionLabel>What kind of help is needed?</SectionLabel>
                    <div className="flex flex-wrap gap-2">
                      {CARE_NEEDS.map((need) => (
                        <SelectionChip
                          key={need}
                          selected={careNeeds.includes(need)}
                          onClick={() => toggleCareNeed(need)}
                          size="sm"
                        >
                          {need}
                        </SelectionChip>
                      ))}
                    </div>
                  </div>

                  {/* Timeline */}
                  <div>
                    <SectionLabel>When do you need care?</SectionLabel>
                    <div className="flex flex-wrap gap-2">
                      {TIMELINES.map(({ value, label }) => (
                        <SelectionChip
                          key={value}
                          selected={timeline === value}
                          onClick={() => setTimeline(value)}
                          size="sm"
                        >
                          {label}
                        </SelectionChip>
                      ))}
                    </div>
                  </div>

                  {/* Schedule preference */}
                  <div>
                    <SectionLabel>Preferred schedule</SectionLabel>
                    <div className="flex flex-wrap gap-2">
                      {SCHEDULE_OPTIONS.map(({ value, label }) => (
                        <SelectionChip
                          key={value}
                          selected={schedulePreference === value}
                          onClick={() => setSchedulePreference(value)}
                          size="sm"
                        >
                          {label}
                        </SelectionChip>
                      ))}
                    </div>
                  </div>

                  {/* Description / About situation */}
                  <div>
                    <SectionLabel>Tell us about your situation</SectionLabel>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Share any details that would help providers understand your needs..."
                      rows={4}
                      className="w-full px-4 py-3.5 rounded-xl bg-gray-100 border-0 focus:bg-white focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-gray-900 placeholder:text-gray-400 resize-none"
                    />
                  </div>
                </div>
              )}

              {/* Step 4: Payment & Benefits */}
              {step === 4 && (
                <div className="space-y-8">
                  <div>
                    <SectionLabel>How do you plan to pay for care?</SectionLabel>
                    <p className="text-sm text-gray-500 -mt-1 mb-4">
                      Select all that apply
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {PAYMENT_OPTIONS.map((option) => (
                        <SelectionChip
                          key={option}
                          selected={payments.includes(option)}
                          onClick={() => togglePayment(option)}
                        >
                          {option}
                        </SelectionChip>
                      ))}
                    </div>
                  </div>
                </div>
              )}
          </div>
        </div>

        {/* Footer - minimal Apple-style */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
          {/* Left: Back button */}
          <div className="w-20">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((step - 1) as Step)}
                className="flex items-center gap-1 text-[15px] font-medium text-gray-500 hover:text-gray-900 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
            )}
          </div>

          {/* Center: Progress + save status */}
          <div className="flex flex-col items-center gap-2">
            <ProgressDots current={step - 1} total={4} />
            {hasChanges && (
              <div className="flex items-center gap-1.5 text-xs text-gray-400 h-4">
                {saving ? (
                  <>
                    <div className="w-3 h-3 border-[1.5px] border-gray-300 border-t-transparent rounded-full animate-spin" />
                    <span>Saving</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Saved</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Right: Next or Done button */}
          <div className="w-20 flex justify-end">
            {step < 4 ? (
              <button
                type="button"
                onClick={() => setStep((step + 1) as Step)}
                className="flex items-center gap-1 text-[15px] font-semibold text-primary-600 hover:text-primary-700 transition-colors"
              >
                Next
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleClose}
                className="px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white text-[15px] font-semibold rounded-full transition-colors"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

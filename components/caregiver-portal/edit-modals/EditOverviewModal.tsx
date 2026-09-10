"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Image from "next/image";
import Modal from "@/components/ui/Modal";
import { saveStudentProfile } from "./save-profile";
import type { BaseEditModalProps } from "./types";

// University list with locations - expand as needed
const UNIVERSITIES = [
  { name: "University of Texas at Austin", city: "Austin", state: "TX" },
  { name: "Texas A&M University", city: "College Station", state: "TX" },
  { name: "Rice University", city: "Houston", state: "TX" },
  { name: "Baylor University", city: "Waco", state: "TX" },
  { name: "Texas Tech University", city: "Lubbock", state: "TX" },
  { name: "University of Houston", city: "Houston", state: "TX" },
  { name: "Southern Methodist University", city: "Dallas", state: "TX" },
  { name: "Texas Christian University", city: "Fort Worth", state: "TX" },
  { name: "University of North Texas", city: "Denton", state: "TX" },
  { name: "Texas State University", city: "San Marcos", state: "TX" },
  { name: "University of Texas at Dallas", city: "Richardson", state: "TX" },
  { name: "University of Texas at San Antonio", city: "San Antonio", state: "TX" },
  { name: "University of Texas at Arlington", city: "Arlington", state: "TX" },
  { name: "University of Texas at El Paso", city: "El Paso", state: "TX" },
  { name: "Sam Houston State University", city: "Huntsville", state: "TX" },
  { name: "Stephen F. Austin State University", city: "Nacogdoches", state: "TX" },
  { name: "Tarleton State University", city: "Stephenville", state: "TX" },
  { name: "Texas A&M University-Commerce", city: "Commerce", state: "TX" },
  { name: "Texas A&M University-Corpus Christi", city: "Corpus Christi", state: "TX" },
  { name: "Prairie View A&M University", city: "Prairie View", state: "TX" },
  { name: "Lamar University", city: "Beaumont", state: "TX" },
  { name: "Texas Woman's University", city: "Denton", state: "TX" },
  { name: "Abilene Christian University", city: "Abilene", state: "TX" },
  { name: "Trinity University", city: "San Antonio", state: "TX" },
  { name: "Michigan State University", city: "East Lansing", state: "MI" },
  { name: "University of Michigan", city: "Ann Arbor", state: "MI" },
  { name: "Ohio State University", city: "Columbus", state: "OH" },
  { name: "University of Florida", city: "Gainesville", state: "FL" },
  { name: "Florida State University", city: "Tallahassee", state: "FL" },
  { name: "Arizona State University", city: "Tempe", state: "AZ" },
  { name: "University of Arizona", city: "Tucson", state: "AZ" },
  { name: "University of California, Los Angeles", city: "Los Angeles", state: "CA" },
  { name: "University of Southern California", city: "Los Angeles", state: "CA" },
  { name: "Stanford University", city: "Stanford", state: "CA" },
  { name: "Other", city: "", state: "" },
];

export default function EditOverviewModal({
  profile,
  onClose,
  onSaved,
  guidedMode,
  guidedStep,
  guidedTotal,
  onGuidedBack,
}: BaseEditModalProps) {
  const meta = profile.metadata;

  // Track mounted state
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const [displayName, setDisplayName] = useState(profile.display_name || "");
  const [university, setUniversity] = useState(meta.university || "");
  const [major, setMajor] = useState(meta.major || "");
  const [photoUrl, setPhotoUrl] = useState(profile.image_url || "");

  // Auto-populate city/state from university if missing
  const initialCityState = (() => {
    if (profile.city && profile.state) {
      return { city: profile.city, state: profile.state };
    }
    // Try to match existing university to our list
    const match = UNIVERSITIES.find(
      (u) => u.name.toLowerCase().trim() === (meta.university || "").toLowerCase().trim()
    );
    if (match?.city && match?.state) {
      return { city: match.city, state: match.state };
    }
    return { city: "", state: "" };
  })();
  const [city, setCity] = useState(initialCityState.city);
  const [state, setState] = useState(initialCityState.state);

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // University search
  const [universitySearch, setUniversitySearch] = useState(meta.university || "");
  const [showUniversityDropdown, setShowUniversityDropdown] = useState(false);
  const universityInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter universities based on search
  const filteredUniversities = useMemo(() => {
    if (!universitySearch.trim()) return UNIVERSITIES;
    const search = universitySearch.toLowerCase();
    return UNIVERSITIES.filter(
      (u) =>
        u.name.toLowerCase().includes(search) ||
        u.city.toLowerCase().includes(search)
    );
  }, [universitySearch]);

  // Handle university selection
  const selectUniversity = (uni: typeof UNIVERSITIES[0]) => {
    setUniversity(uni.name);
    setUniversitySearch(uni.name);
    if (uni.city && uni.state) {
      setCity(uni.city);
      setState(uni.state);
    }
    setShowUniversityDropdown(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        universityInputRef.current &&
        !universityInputRef.current.contains(e.target as Node)
      ) {
        setShowUniversityDropdown(false);
        // If they typed something but didn't select, keep it as custom
        if (universitySearch && !UNIVERSITIES.find((u) => u.name === universitySearch)) {
          setUniversity(universitySearch);
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [universitySearch]);

  // Track changes
  const hasChanges =
    displayName !== (profile.display_name || "") ||
    university !== (meta.university || "") ||
    major !== (meta.major || "") ||
    city !== (profile.city || "") ||
    state !== (profile.state || "") ||
    photoUrl !== (profile.image_url || "");

  const isValid = displayName.trim().length > 0;

  async function handlePhotoUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be less than 5MB");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("profileId", profile.id);

      const res = await fetch("/api/medjobs/upload-photo", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to upload photo");
        return;
      }

      setPhotoUrl(data.imageUrl);
    } catch {
      setError("Network error uploading photo");
    } finally {
      if (isMountedRef.current) {
        setUploading(false);
      }
    }
  }

  const handleDrag = (e: React.DragEvent, active: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(active);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handlePhotoUpload(file);
  };

  async function handleSave() {
    if (!hasChanges && !guidedMode) {
      onClose();
      return;
    }

    if (!displayName.trim()) {
      setError("Name is required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await saveStudentProfile({
        profileId: profile.id,
        topLevelFields: {
          display_name: displayName.trim(),
          city: city.trim() || null,
          state: state.trim().toUpperCase() || null,
        },
        metadataFields: {
          university: university.trim() || null,
          major: major.trim() || null,
        },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      if (isMountedRef.current) {
        setSaving(false);
      }
    }
  }

  function handleBack() {
    if (guidedMode && onGuidedBack) {
      onGuidedBack();
    } else {
      onClose();
    }
  }

  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

  const getButtonText = () => {
    return saving ? "Saving..." : guidedMode ? "Save & Next" : "Save";
  };

  const getBackButtonText = () => {
    return guidedMode && onGuidedBack ? "Back" : "Cancel";
  };

  // Custom header with title and subtitle
  const headerContent = (
    <div>
      <h2 className="text-xl sm:text-[22px] font-semibold text-gray-900">Profile Overview</h2>
      <p className="text-sm text-gray-500 mt-0.5">This is what providers see first</p>
    </div>
  );

  // Footer component
  const footerContent = (
    <div className="pt-4 border-t border-gray-100">
      {guidedMode && guidedStep && guidedTotal && (
        <div className="flex gap-0.5 px-1 mb-4">
          {Array.from({ length: guidedTotal }, (_, i) => (
            <div
              key={i}
              className={`flex-1 h-[3px] rounded-full transition-colors duration-300 ${
                i + 1 <= guidedStep ? "bg-primary-600" : "bg-gray-100"
              }`}
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handleBack}
          disabled={saving || uploading}
          className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50"
        >
          {getBackButtonText()}
        </button>

        <div className="flex items-center gap-2 text-xs text-gray-400">
          {guidedMode && guidedStep && guidedTotal && (
            <span>Step {guidedStep} of {guidedTotal}</span>
          )}
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || uploading || !isValid}
          className={`px-6 py-2.5 text-sm font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
            isValid
              ? "bg-primary-600 text-white hover:bg-primary-700 shadow-sm hover:shadow"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          {saving ? (
            <span className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Saving...
            </span>
          ) : (
            getButtonText()
          )}
        </button>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={headerContent}
      size="2xl"
      footer={footerContent}
    >
      <div className="pt-6">
        {/* Photo Upload - Centered */}
        <div className="flex flex-col items-center mb-8">
          <div
            onDragEnter={(e) => handleDrag(e, true)}
            onDragLeave={(e) => handleDrag(e, false)}
            onDragOver={(e) => handleDrag(e, true)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative cursor-pointer group transition-all ${
              dragActive ? "scale-105" : ""
            }`}
          >
            {photoUrl ? (
              <div className="relative">
                <Image
                  src={photoUrl}
                  alt="Profile"
                  width={120}
                  height={120}
                  className={`w-28 h-28 rounded-2xl object-cover ring-4 transition-all ${
                    dragActive
                      ? "ring-primary-300"
                      : "ring-gray-100 group-hover:ring-primary-100"
                  }`}
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-2xl transition-all flex items-center justify-center">
                  <span className="text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                    Change
                  </span>
                </div>
              </div>
            ) : (
              <div className={`w-28 h-28 rounded-2xl flex flex-col items-center justify-center transition-all ${
                dragActive
                  ? "bg-primary-100 border-2 border-primary-400"
                  : "bg-gradient-to-br from-primary-50 to-primary-100 border-2 border-dashed border-primary-200 group-hover:border-primary-400"
              }`}>
                {displayName ? (
                  <span className="text-2xl font-bold text-primary-600">{initials}</span>
                ) : (
                  <svg className="w-8 h-8 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                )}
                <span className="text-xs text-primary-600 mt-1 font-medium">Add photo</span>
              </div>
            )}

            {uploading && (
              <div className="absolute inset-0 bg-white/90 rounded-2xl flex items-center justify-center">
                <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
              </div>
            )}
          </div>

          <p className="text-xs text-gray-400 mt-3">
            {dragActive ? "Drop to upload" : "Click or drag to upload"}
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handlePhotoUpload(file);
            }}
          />
        </div>

        {/* Form Fields */}
        <div className="max-w-md mx-auto space-y-5 pb-48">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Full name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your full name"
              className="w-full bg-white border border-gray-200 focus:border-primary-600 focus:ring-2 focus:ring-primary-100 outline-none rounded-xl px-4 py-3.5 text-sm text-gray-900 placeholder:text-gray-400 transition-all"
            />
          </div>

          {/* University with search/autocomplete */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              University
            </label>
            <div className="relative">
              <input
                ref={universityInputRef}
                type="text"
                value={universitySearch}
                onChange={(e) => {
                  setUniversitySearch(e.target.value);
                  setShowUniversityDropdown(true);
                }}
                onFocus={() => setShowUniversityDropdown(true)}
                placeholder="Search for your university..."
                className="w-full bg-white border border-gray-200 focus:border-primary-600 focus:ring-2 focus:ring-primary-100 outline-none rounded-xl px-4 py-3.5 text-sm text-gray-900 placeholder:text-gray-400 transition-all pr-10"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {/* Dropdown */}
            {showUniversityDropdown && (
              <div
                ref={dropdownRef}
                className="absolute z-30 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-xl max-h-60 overflow-y-auto"
              >
                {filteredUniversities.length > 0 ? (
                  filteredUniversities.map((uni) => (
                    <button
                      key={uni.name}
                      type="button"
                      onClick={() => selectUniversity(uni)}
                      className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors first:rounded-t-xl last:rounded-b-xl ${
                        university === uni.name ? "bg-primary-50" : ""
                      }`}
                    >
                      <p className="text-sm font-medium text-gray-900">{uni.name}</p>
                      {uni.city && (
                        <p className="text-xs text-gray-500">{uni.city}, {uni.state}</p>
                      )}
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-3 text-sm text-gray-500">
                    No universities found. You can type a custom name.
                  </div>
                )}
              </div>
            )}

          </div>

          {/* City / State */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                City
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Austin"
                className="w-full bg-white border border-gray-200 focus:border-primary-600 focus:ring-2 focus:ring-primary-100 outline-none rounded-xl px-4 py-3.5 text-sm text-gray-900 placeholder:text-gray-400 transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                State
              </label>
              <input
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
                placeholder="TX"
                maxLength={2}
                className="w-full bg-white border border-gray-200 focus:border-primary-600 focus:ring-2 focus:ring-primary-100 outline-none rounded-xl px-4 py-3.5 text-sm text-gray-900 placeholder:text-gray-400 transition-all uppercase"
              />
            </div>
          </div>

          {/* Major / Program of Study */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Major / Program of study
            </label>
            <input
              type="text"
              value={major}
              onChange={(e) => setMajor(e.target.value)}
              placeholder="e.g. Pre-Nursing, Biology, Health Sciences"
              className="w-full bg-white border border-gray-200 focus:border-primary-600 focus:ring-2 focus:ring-primary-100 outline-none rounded-xl px-4 py-3.5 text-sm text-gray-900 placeholder:text-gray-400 transition-all"
            />
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-auto max-w-md mt-6 p-4 bg-red-50 border border-red-200 rounded-2xl">
            <p className="text-sm text-red-600 text-center" role="alert">{error}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

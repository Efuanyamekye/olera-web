"use client";

import { useState, useRef, useCallback } from "react";
import Modal from "@/components/ui/Modal";
import { saveStudentProfile } from "./save-profile";
import ModalFooter from "./ModalFooter";
import type { BaseEditModalProps } from "./types";

// File info type for upload preview
interface UploadedFile {
  name: string;
  type: string;
  size: number;
}

export default function EditVerificationModal({
  profile,
  onClose,
  onSaved,
  guidedMode,
  guidedStep,
  guidedTotal,
  onGuidedBack,
}: BaseEditModalProps) {
  const meta = profile.metadata;

  // Video
  const [videoUrl, setVideoUrl] = useState(meta.video_intro_url || "");
  const [videoSubmitting, setVideoSubmitting] = useState(false);
  const [videoSubmitted, setVideoSubmitted] = useState(!!meta.video_intro_url);

  // Driver's license
  const [licenseUploaded, setLicenseUploaded] = useState(!!meta.drivers_license_url);
  const [licenseFile, setLicenseFile] = useState<UploadedFile | null>(null);
  const [licenseExpiration, setLicenseExpiration] = useState(meta.drivers_license_expiration || "");
  const [licenseUploading, setLicenseUploading] = useState(false);

  // Car insurance
  const [insuranceUploaded, setInsuranceUploaded] = useState(!!meta.car_insurance_url);
  const [insuranceFile, setInsuranceFile] = useState<UploadedFile | null>(null);
  const [insuranceExpiration, setInsuranceExpiration] = useState(meta.car_insurance_expiration || "");
  const [insuranceUploading, setInsuranceUploading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Drag state
  const [licenseDragActive, setLicenseDragActive] = useState(false);
  const [insuranceDragActive, setInsuranceDragActive] = useState(false);

  const licenseInputRef = useRef<HTMLInputElement>(null);
  const insuranceInputRef = useRef<HTMLInputElement>(null);

  // Track if any verification item is complete
  const hasVideo = videoSubmitted || !!videoUrl.trim();
  const hasLicense = licenseUploaded && !!licenseExpiration;
  const hasInsurance = insuranceUploaded && !!insuranceExpiration;

  // Progress count
  const completedCount = [hasVideo, hasLicense, hasInsurance].filter(Boolean).length;

  // Check if there's a new video URL to submit
  const hasNewVideo = videoUrl.trim() && videoUrl !== (meta.video_intro_url || "") && !videoSubmitted;

  // Has changes if any new data
  const hasChanges =
    hasNewVideo ||
    licenseExpiration !== (meta.drivers_license_expiration || "") ||
    insuranceExpiration !== (meta.car_insurance_expiration || "");

  async function submitVideo() {
    if (!videoUrl.trim()) return true; // No video to submit is OK
    if (videoSubmitted && videoUrl === meta.video_intro_url) return true; // Already submitted

    setVideoSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/medjobs/submit-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: profile.slug, videoUrl: videoUrl.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to submit video");
        return false;
      }

      setVideoSubmitted(true);
      return true;
    } catch {
      setError("Network error");
      return false;
    } finally {
      setVideoSubmitting(false);
    }
  }

  async function handleDocumentUpload(type: "drivers_license" | "car_insurance", file: File) {
    const isLicense = type === "drivers_license";
    if (isLicense) setLicenseUploading(true);
    else setInsuranceUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("profileId", profile.id);
      formData.append("documentType", type);

      const res = await fetch("/api/medjobs/upload-document", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Upload failed");
        return;
      }

      // Store file info for preview
      const fileInfo = { name: file.name, type: file.type, size: file.size };
      if (isLicense) {
        setLicenseUploaded(true);
        setLicenseFile(fileInfo);
      } else {
        setInsuranceUploaded(true);
        setInsuranceFile(fileInfo);
      }
    } catch {
      setError("Network error");
    } finally {
      if (isLicense) setLicenseUploading(false);
      else setInsuranceUploading(false);
    }
  }

  async function handleExpirationChange(type: "drivers_license" | "car_insurance", date: string) {
    const isLicense = type === "drivers_license";
    if (isLicense) setLicenseExpiration(date);
    else setInsuranceExpiration(date);

    // Auto-save expiration date
    try {
      await saveStudentProfile({
        profileId: profile.id,
        metadataFields: {
          [isLicense ? "drivers_license_expiration" : "car_insurance_expiration"]: date || null,
        },
      });
    } catch {
      // Ignore save errors for expiration dates
    }
  }

  // Drag and drop handlers
  const handleDrag = useCallback((e: React.DragEvent, type: "license" | "insurance", active: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    if (type === "license") setLicenseDragActive(active);
    else setInsuranceDragActive(active);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, type: "drivers_license" | "car_insurance") => {
    e.preventDefault();
    e.stopPropagation();
    setLicenseDragActive(false);
    setInsuranceDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleDocumentUpload(type, file);
    }
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);

    try {
      // Submit video if there's a new one
      if (hasNewVideo) {
        const videoSuccess = await submitVideo();
        if (!videoSuccess) {
          setSaving(false);
          return;
        }
      }

      // Save expiration dates if changed
      if (licenseExpiration !== (meta.drivers_license_expiration || "") ||
          insuranceExpiration !== (meta.car_insurance_expiration || "")) {
        await saveStudentProfile({
          profileId: profile.id,
          metadataFields: {
            drivers_license_expiration: licenseExpiration || null,
            car_insurance_expiration: insuranceExpiration || null,
          },
        });
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const isUploading = licenseUploading || insuranceUploading || videoSubmitting;

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Verification"
      size="lg"
      footer={
        <ModalFooter
          saving={saving || isUploading}
          hasChanges={true}
          onClose={onClose}
          onSave={handleSave}
          guidedMode={guidedMode}
          guidedStep={guidedStep}
          guidedTotal={guidedTotal}
          onGuidedBack={onGuidedBack}
        />
      }
    >
      <div className="space-y-5 py-2">
        {/* Progress summary */}
        <div className="text-center pb-2">
          <p className="text-sm text-gray-500">
            {completedCount === 3
              ? "All verifications complete!"
              : `${completedCount} of 3 complete`}
          </p>
        </div>

        {/* 1. Intro Video */}
        <div className="bg-gray-50 rounded-2xl p-5">
          <div className="flex items-start gap-4">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ${
              hasVideo ? "bg-[#199087]" : "bg-gray-200"
            }`}>
              {hasVideo ? (
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <span className="text-sm font-semibold text-gray-500">1</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-gray-900 mb-1">Share your intro video</h3>
              <p className="text-sm text-gray-500 mb-4">
                Paste a YouTube or Loom link. Share your background, why you care about this work, and what makes you reliable.
              </p>

              {videoSubmitted ? (
                <div className="flex items-center gap-3 p-3 bg-[#199087]/10 border border-[#199087]/20 rounded-xl">
                  <div className="w-10 h-10 rounded-lg bg-[#199087]/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-[#199087]" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#199087]">Video submitted</p>
                    <p className="text-xs text-[#199087]/70 truncate">{videoUrl || meta.video_intro_url}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setVideoSubmitted(false); setVideoUrl(meta.video_intro_url || ""); }}
                    className="text-xs font-medium text-[#199087] hover:text-[#157a72] px-2 py-1"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <input
                  type="url"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=... or https://loom.com/..."
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:border-[#199087] focus:ring-1 focus:ring-[#199087]/20 outline-none transition-colors"
                />
              )}
            </div>
          </div>
        </div>

        {/* 2. Driver's License */}
        <div className="bg-gray-50 rounded-2xl p-5">
          <div className="flex items-start gap-4">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ${
              hasLicense ? "bg-[#199087]" : "bg-gray-200"
            }`}>
              {hasLicense ? (
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <span className="text-sm font-semibold text-gray-500">2</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-gray-900 mb-1">Upload driver&apos;s license</h3>
              <p className="text-sm text-gray-500 mb-4">
                Verifies your identity. We keep it secure and never share it.
              </p>

              {licenseUploaded ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-[#199087]/10 border border-[#199087]/20 rounded-xl">
                    <div className="w-10 h-10 rounded-lg bg-[#199087]/20 flex items-center justify-center">
                      <svg className="w-5 h-5 text-[#199087]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#199087]">
                        {licenseFile ? licenseFile.name : "Document uploaded"}
                      </p>
                      {licenseFile && (
                        <p className="text-xs text-[#199087]/70">{formatFileSize(licenseFile.size)}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => licenseInputRef.current?.click()}
                      disabled={licenseUploading}
                      className="text-xs font-medium text-[#199087] hover:text-[#157a72] px-2 py-1"
                    >
                      Replace
                    </button>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Expiration date
                    </label>
                    <input
                      type="date"
                      value={licenseExpiration}
                      onChange={(e) => handleExpirationChange("drivers_license", e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:border-[#199087] focus:ring-1 focus:ring-[#199087]/20 outline-none transition-colors"
                    />
                  </div>
                </div>
              ) : (
                <div
                  onDragEnter={(e) => handleDrag(e, "license", true)}
                  onDragLeave={(e) => handleDrag(e, "license", false)}
                  onDragOver={(e) => handleDrag(e, "license", true)}
                  onDrop={(e) => handleDrop(e, "drivers_license")}
                  onClick={() => licenseInputRef.current?.click()}
                  className={`relative flex flex-col items-center justify-center p-8 bg-white border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200 ${
                    licenseDragActive
                      ? "border-[#199087] bg-[#199087]/5"
                      : licenseUploading
                      ? "border-gray-200 bg-gray-50"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {licenseUploading ? (
                    <>
                      <div className="w-8 h-8 border-2 border-gray-300 border-t-[#199087] rounded-full animate-spin mb-2" />
                      <p className="text-sm font-medium text-gray-600">Uploading...</p>
                    </>
                  ) : (
                    <>
                      <svg className="w-8 h-8 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      <p className="text-sm font-medium text-gray-700">
                        {licenseDragActive ? "Drop to upload" : "Click or drag to upload"}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">JPEG, PNG, or PDF up to 10MB</p>
                    </>
                  )}
                </div>
              )}

              <input
                ref={licenseInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleDocumentUpload("drivers_license", file);
                }}
              />
            </div>
          </div>
        </div>

        {/* 3. Car Insurance */}
        <div className="bg-gray-50 rounded-2xl p-5">
          <div className="flex items-start gap-4">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ${
              hasInsurance ? "bg-[#199087]" : "bg-gray-200"
            }`}>
              {hasInsurance ? (
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <span className="text-sm font-semibold text-gray-500">3</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-gray-900 mb-1">Upload car insurance</h3>
              <p className="text-sm text-gray-500 mb-4">
                Confirms you can get to assignments safely. Upload your insurance card or declaration page.
              </p>

              {insuranceUploaded ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-[#199087]/10 border border-[#199087]/20 rounded-xl">
                    <div className="w-10 h-10 rounded-lg bg-[#199087]/20 flex items-center justify-center">
                      <svg className="w-5 h-5 text-[#199087]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#199087]">
                        {insuranceFile ? insuranceFile.name : "Document uploaded"}
                      </p>
                      {insuranceFile && (
                        <p className="text-xs text-[#199087]/70">{formatFileSize(insuranceFile.size)}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => insuranceInputRef.current?.click()}
                      disabled={insuranceUploading}
                      className="text-xs font-medium text-[#199087] hover:text-[#157a72] px-2 py-1"
                    >
                      Replace
                    </button>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Expiration date
                    </label>
                    <input
                      type="date"
                      value={insuranceExpiration}
                      onChange={(e) => handleExpirationChange("car_insurance", e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:border-[#199087] focus:ring-1 focus:ring-[#199087]/20 outline-none transition-colors"
                    />
                  </div>
                </div>
              ) : (
                <div
                  onDragEnter={(e) => handleDrag(e, "insurance", true)}
                  onDragLeave={(e) => handleDrag(e, "insurance", false)}
                  onDragOver={(e) => handleDrag(e, "insurance", true)}
                  onDrop={(e) => handleDrop(e, "car_insurance")}
                  onClick={() => insuranceInputRef.current?.click()}
                  className={`relative flex flex-col items-center justify-center p-8 bg-white border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200 ${
                    insuranceDragActive
                      ? "border-[#199087] bg-[#199087]/5"
                      : insuranceUploading
                      ? "border-gray-200 bg-gray-50"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {insuranceUploading ? (
                    <>
                      <div className="w-8 h-8 border-2 border-gray-300 border-t-[#199087] rounded-full animate-spin mb-2" />
                      <p className="text-sm font-medium text-gray-600">Uploading...</p>
                    </>
                  ) : (
                    <>
                      <svg className="w-8 h-8 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      <p className="text-sm font-medium text-gray-700">
                        {insuranceDragActive ? "Drop to upload" : "Click or drag to upload"}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">JPEG, PNG, or PDF up to 10MB</p>
                    </>
                  )}
                </div>
              )}

              <input
                ref={insuranceInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleDocumentUpload("car_insurance", file);
                }}
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm text-red-600" role="alert">{error}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

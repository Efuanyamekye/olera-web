"use client";

import { useState, useRef, useCallback } from "react";
import Modal from "@/components/ui/Modal";
import { saveStudentProfile } from "./save-profile";
import type { BaseEditModalProps } from "./types";

// File info type for upload preview
interface UploadedFile {
  name: string;
  type: string;
  size: number;
}

type Step = 1 | 2 | 3;

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

  // Wizard step
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [slideDirection, setSlideDirection] = useState<"left" | "right">("right");
  const [isTransitioning, setIsTransitioning] = useState(false);

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

  // Step labels
  const stepLabels: Record<Step, string> = {
    1: "Intro Video",
    2: "Driver's License",
    3: "Car Insurance",
  };

  // Navigate with animation
  const navigateToStep = useCallback((step: Step) => {
    if (step === currentStep || isTransitioning) return;
    setSlideDirection(step > currentStep ? "right" : "left");
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentStep(step);
      setIsTransitioning(false);
    }, 150);
  }, [currentStep, isTransitioning]);

  async function submitVideo() {
    if (!videoUrl.trim()) return true;
    if (videoSubmitted && videoUrl === meta.video_intro_url) return true;

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

  const handleDocumentUpload = useCallback(async (type: "drivers_license" | "car_insurance", file: File) => {
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
  }, [profile.id]);

  async function handleExpirationChange(type: "drivers_license" | "car_insurance", date: string) {
    const isLicense = type === "drivers_license";
    if (isLicense) setLicenseExpiration(date);
    else setInsuranceExpiration(date);

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
  }, [handleDocumentUpload]);

  async function handleContinue() {
    setError(null);

    // Save current step data before moving on
    if (currentStep === 1 && hasNewVideo) {
      const success = await submitVideo();
      if (!success) return;
    }

    if (currentStep < 3) {
      navigateToStep((currentStep + 1) as Step);
    } else {
      // Final step - save and close
      await handleFinish();
    }
  }

  async function handleFinish() {
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

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Check if current step is complete
  const isCurrentStepComplete = () => {
    switch (currentStep) {
      case 1: return hasVideo;
      case 2: return hasLicense;
      case 3: return hasInsurance;
    }
  };

  // Get button text
  const getButtonText = () => {
    if (currentStep === 3) {
      return saving ? "Saving..." : "Done";
    }
    if (isCurrentStepComplete()) {
      return "Continue";
    }
    return "Skip for now";
  };

  // Progress dot component
  const ProgressDot = ({ step, isComplete, isCurrent }: { step: Step; isComplete: boolean; isCurrent: boolean }) => (
    <button
      type="button"
      onClick={() => navigateToStep(step)}
      className="flex flex-col items-center group"
      disabled={isTransitioning}
    >
      <div className={`
        w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300
        ${isCurrent
          ? "bg-[#199087] ring-4 ring-[#199087]/20 scale-110"
          : isComplete
            ? "bg-[#199087] group-hover:scale-105"
            : "bg-gray-200 group-hover:bg-gray-300"
        }
      `}>
        {isComplete && !isCurrent ? (
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <span className={`text-sm font-semibold ${isCurrent || isComplete ? "text-white" : "text-gray-500"}`}>
            {step}
          </span>
        )}
      </div>
      <span className={`mt-2 text-xs font-medium transition-colors ${
        isCurrent ? "text-[#199087]" : "text-gray-400"
      }`}>
        {stepLabels[step]}
      </span>
    </button>
  );

  // Render step content
  const renderStepContent = () => {
    const transitionClass = isTransitioning
      ? slideDirection === "right"
        ? "opacity-0 translate-x-4"
        : "opacity-0 -translate-x-4"
      : "opacity-100 translate-x-0";

    return (
      <div className={`transition-all duration-150 ease-out ${transitionClass}`}>
        {currentStep === 1 && (
          <div className="text-center">
            {/* Icon */}
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-[#199087]/10 to-[#199087]/5 flex items-center justify-center">
              <svg className="w-10 h-10 text-[#199087]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>

            {/* Title & Description */}
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Share your intro video</h3>
            <p className="text-gray-500 text-sm mb-8 max-w-sm mx-auto">
              Paste a YouTube or Loom link. Share your background, why you care about this work, and what makes you reliable.
            </p>

            {/* Input or Success State */}
            {videoSubmitted ? (
              <div className="max-w-sm mx-auto">
                <div className="flex items-center gap-3 p-4 bg-[#199087]/5 border border-[#199087]/20 rounded-2xl">
                  <div className="w-12 h-12 rounded-xl bg-[#199087]/10 flex items-center justify-center shrink-0">
                    <svg className="w-6 h-6 text-[#199087]" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-medium text-[#199087]">Video added</p>
                    <p className="text-xs text-[#199087]/70 truncate">{videoUrl || meta.video_intro_url}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setVideoSubmitted(false); setVideoUrl(meta.video_intro_url || ""); }}
                    className="text-sm font-medium text-[#199087] hover:text-[#157a72] px-3 py-1.5 rounded-lg hover:bg-[#199087]/10 transition-colors"
                  >
                    Change
                  </button>
                </div>
              </div>
            ) : (
              <div className="max-w-sm mx-auto">
                <input
                  type="url"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=..."
                  className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm text-center focus:border-[#199087] focus:ring-2 focus:ring-[#199087]/20 focus:bg-white outline-none transition-all placeholder:text-gray-400"
                  autoFocus
                />
                <p className="text-xs text-gray-400 mt-3">
                  YouTube, Loom, or Vimeo links work great
                </p>
              </div>
            )}
          </div>
        )}

        {currentStep === 2 && (
          <div className="text-center">
            {/* Icon */}
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-[#199087]/10 to-[#199087]/5 flex items-center justify-center">
              <svg className="w-10 h-10 text-[#199087]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
              </svg>
            </div>

            {/* Title & Description */}
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Upload driver&apos;s license</h3>
            <p className="text-gray-500 text-sm mb-8 max-w-sm mx-auto">
              Verifies your identity. We keep it secure and never share it with families.
            </p>

            {/* Upload Area or Success State */}
            {licenseUploaded ? (
              <div className="max-w-sm mx-auto space-y-4">
                <div className="flex items-center gap-3 p-4 bg-[#199087]/5 border border-[#199087]/20 rounded-2xl">
                  <div className="w-12 h-12 rounded-xl bg-[#199087]/10 flex items-center justify-center shrink-0">
                    <svg className="w-6 h-6 text-[#199087]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0 text-left">
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
                    className="text-sm font-medium text-[#199087] hover:text-[#157a72] px-3 py-1.5 rounded-lg hover:bg-[#199087]/10 transition-colors"
                  >
                    Replace
                  </button>
                </div>

                <div className="text-left">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Expiration date
                  </label>
                  <input
                    type="date"
                    value={licenseExpiration}
                    onChange={(e) => handleExpirationChange("drivers_license", e.target.value)}
                    className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:border-[#199087] focus:ring-2 focus:ring-[#199087]/20 focus:bg-white outline-none transition-all"
                  />
                </div>
              </div>
            ) : (
              <div className="max-w-sm mx-auto">
                <div
                  onDragEnter={(e) => handleDrag(e, "license", true)}
                  onDragLeave={(e) => handleDrag(e, "license", false)}
                  onDragOver={(e) => handleDrag(e, "license", true)}
                  onDrop={(e) => handleDrop(e, "drivers_license")}
                  onClick={() => licenseInputRef.current?.click()}
                  className={`relative flex flex-col items-center justify-center py-12 px-8 bg-gray-50 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-200 ${
                    licenseDragActive
                      ? "border-[#199087] bg-[#199087]/5 scale-[1.02]"
                      : licenseUploading
                      ? "border-gray-200 bg-gray-100"
                      : "border-gray-200 hover:border-[#199087]/50 hover:bg-gray-100"
                  }`}
                >
                  {licenseUploading ? (
                    <>
                      <div className="w-10 h-10 border-[3px] border-gray-200 border-t-[#199087] rounded-full animate-spin mb-3" />
                      <p className="text-sm font-medium text-gray-600">Uploading...</p>
                    </>
                  ) : (
                    <>
                      <div className="w-14 h-14 rounded-2xl bg-white shadow-sm flex items-center justify-center mb-4">
                        <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                      </div>
                      <p className="text-sm font-medium text-gray-700 mb-1">
                        {licenseDragActive ? "Drop to upload" : "Click or drag to upload"}
                      </p>
                      <p className="text-xs text-gray-400">JPEG, PNG, or PDF up to 10MB</p>
                    </>
                  )}
                </div>
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
        )}

        {currentStep === 3 && (
          <div className="text-center">
            {/* Icon */}
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-[#199087]/10 to-[#199087]/5 flex items-center justify-center">
              <svg className="w-10 h-10 text-[#199087]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>

            {/* Title & Description */}
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Upload car insurance</h3>
            <p className="text-gray-500 text-sm mb-8 max-w-sm mx-auto">
              Confirms you can get to assignments safely. Upload your insurance card or declaration page.
            </p>

            {/* Upload Area or Success State */}
            {insuranceUploaded ? (
              <div className="max-w-sm mx-auto space-y-4">
                <div className="flex items-center gap-3 p-4 bg-[#199087]/5 border border-[#199087]/20 rounded-2xl">
                  <div className="w-12 h-12 rounded-xl bg-[#199087]/10 flex items-center justify-center shrink-0">
                    <svg className="w-6 h-6 text-[#199087]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0 text-left">
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
                    className="text-sm font-medium text-[#199087] hover:text-[#157a72] px-3 py-1.5 rounded-lg hover:bg-[#199087]/10 transition-colors"
                  >
                    Replace
                  </button>
                </div>

                <div className="text-left">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Expiration date
                  </label>
                  <input
                    type="date"
                    value={insuranceExpiration}
                    onChange={(e) => handleExpirationChange("car_insurance", e.target.value)}
                    className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:border-[#199087] focus:ring-2 focus:ring-[#199087]/20 focus:bg-white outline-none transition-all"
                  />
                </div>
              </div>
            ) : (
              <div className="max-w-sm mx-auto">
                <div
                  onDragEnter={(e) => handleDrag(e, "insurance", true)}
                  onDragLeave={(e) => handleDrag(e, "insurance", false)}
                  onDragOver={(e) => handleDrag(e, "insurance", true)}
                  onDrop={(e) => handleDrop(e, "car_insurance")}
                  onClick={() => insuranceInputRef.current?.click()}
                  className={`relative flex flex-col items-center justify-center py-12 px-8 bg-gray-50 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-200 ${
                    insuranceDragActive
                      ? "border-[#199087] bg-[#199087]/5 scale-[1.02]"
                      : insuranceUploading
                      ? "border-gray-200 bg-gray-100"
                      : "border-gray-200 hover:border-[#199087]/50 hover:bg-gray-100"
                  }`}
                >
                  {insuranceUploading ? (
                    <>
                      <div className="w-10 h-10 border-[3px] border-gray-200 border-t-[#199087] rounded-full animate-spin mb-3" />
                      <p className="text-sm font-medium text-gray-600">Uploading...</p>
                    </>
                  ) : (
                    <>
                      <div className="w-14 h-14 rounded-2xl bg-white shadow-sm flex items-center justify-center mb-4">
                        <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                      </div>
                      <p className="text-sm font-medium text-gray-700 mb-1">
                        {insuranceDragActive ? "Drop to upload" : "Click or drag to upload"}
                      </p>
                      <p className="text-xs text-gray-400">JPEG, PNG, or PDF up to 10MB</p>
                    </>
                  )}
                </div>
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
        )}
      </div>
    );
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title=""
      size="md"
    >
      <div className="px-2 pb-2">
        {/* Progress Indicator */}
        <div className="relative flex justify-center items-start gap-8 mb-8 pt-4">
          {/* Connecting lines - positioned between dots */}
          <div className="absolute top-[24px] left-1/2 -translate-x-1/2 flex items-center" style={{ width: "160px" }}>
            <div className={`flex-1 h-[2px] transition-colors duration-300 ${hasVideo ? "bg-[#199087]" : "bg-gray-200"}`} />
            <div className={`flex-1 h-[2px] transition-colors duration-300 ${hasLicense ? "bg-[#199087]" : "bg-gray-200"}`} />
          </div>

          <ProgressDot step={1} isComplete={hasVideo} isCurrent={currentStep === 1} />
          <ProgressDot step={2} isComplete={hasLicense} isCurrent={currentStep === 2} />
          <ProgressDot step={3} isComplete={hasInsurance} isCurrent={currentStep === 3} />
        </div>

        {/* Step Content */}
        <div className="min-h-[320px] flex items-start justify-center pt-4">
          {renderStepContent()}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-auto max-w-sm mt-4 p-4 bg-red-50 border border-red-200 rounded-2xl">
            <p className="text-sm text-red-600 text-center" role="alert">{error}</p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-100">
          <button
            type="button"
            onClick={() => currentStep === 1 ? onClose() : navigateToStep((currentStep - 1) as Step)}
            disabled={isTransitioning || saving}
            className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50"
          >
            {currentStep === 1 ? "Cancel" : "Back"}
          </button>

          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>{completedCount}/3 complete</span>
          </div>

          <button
            type="button"
            onClick={handleContinue}
            disabled={isUploading || saving || isTransitioning}
            className={`px-6 py-2.5 text-sm font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              isCurrentStepComplete()
                ? "bg-[#199087] text-white hover:bg-[#157a72] shadow-sm hover:shadow"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {isUploading ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Processing...
              </span>
            ) : (
              getButtonText()
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}

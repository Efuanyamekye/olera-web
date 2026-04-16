"use client";

import { useState, useRef, useCallback } from "react";
import Modal from "@/components/ui/Modal";
import { saveStudentProfile } from "./save-profile";
import ModalFooter from "./ModalFooter";
import type { BaseEditModalProps } from "./types";

interface UploadedFile {
  name: string;
  size: number;
}

export default function EditResumeModal({
  profile,
  onClose,
  onSaved,
  guidedMode,
  guidedStep,
  guidedTotal,
  onGuidedBack,
}: BaseEditModalProps) {
  const meta = profile.metadata;
  const inputRef = useRef<HTMLInputElement>(null);

  const [linkedinUrl, setLinkedinUrl] = useState(meta.linkedin_url || "");
  const [resumeUrl, setResumeUrl] = useState(meta.resume_url || "");
  const [resumeFile, setResumeFile] = useState<UploadedFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [resumeJustSaved, setResumeJustSaved] = useState(false);

  // Track if resume was already uploaded before opening modal
  const hadResumeOnOpen = !!meta.resume_url;

  // Track changes to either field
  const hasChanges =
    linkedinUrl !== (meta.linkedin_url || "") ||
    resumeUrl !== (meta.resume_url || "");

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Normalize LinkedIn URL - add https:// if missing
  const normalizeLinkedInUrl = (url: string): string => {
    const trimmed = url.trim();
    if (!trimmed) return "";

    // If no protocol, prepend https://
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      return `https://${trimmed}`;
    }
    return trimmed;
  };

  // Validate LinkedIn URL (after normalization)
  const isValidLinkedIn = (url: string) => {
    if (!url.trim()) return true; // Empty is valid (optional field)
    const normalized = normalizeLinkedInUrl(url);
    const pattern = /^https?:\/\/(www\.)?linkedin\.com\/in\/[\w-]+\/?$/i;
    return pattern.test(normalized);
  };

  async function handleSave() {
    // Allow close if no changes at all
    if (!hasChanges && !guidedMode) {
      onClose();
      return;
    }

    // Validate LinkedIn URL if provided
    if (linkedinUrl.trim() && !isValidLinkedIn(linkedinUrl)) {
      setError("Please enter a valid LinkedIn profile URL (e.g., https://linkedin.com/in/yourname)");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Normalize LinkedIn URL before saving
      const normalizedLinkedIn = linkedinUrl.trim() ? normalizeLinkedInUrl(linkedinUrl) : null;

      // Save both fields together to prevent race conditions
      await saveStudentProfile({
        profileId: profile.id,
        metadataFields: {
          linkedin_url: normalizedLinkedIn,
          resume_url: resumeUrl || null,
        },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const handleUpload = useCallback(async (file: File) => {
    // Validate file type
    if (file.type !== "application/pdf") {
      setError("Please upload a PDF file");
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      setError("File size must be less than 10MB");
      return;
    }

    setError(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("profileId", profile.id);
      formData.append("documentType", "resume");

      const res = await fetch("/api/medjobs/upload-document", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Upload failed.");
        return;
      }

      // Update local state with new URL and file info
      if (data.url) {
        setResumeUrl(data.url);
        setResumeFile({ name: file.name, size: file.size });

        // Auto-save immediately after successful upload
        await saveStudentProfile({
          profileId: profile.id,
          metadataFields: {
            resume_url: data.url,
          },
        });

        // Show "Saved!" confirmation briefly
        setResumeJustSaved(true);
        setTimeout(() => setResumeJustSaved(false), 3000);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setUploading(false);
    }
  }, [profile.id]);

  // Drag handlers
  const handleDrag = useCallback((e: React.DragEvent, active: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(active);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleUpload(file);
    }
  }, [handleUpload]);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Resume & LinkedIn"
      size="lg"
      footer={
        <ModalFooter
          saving={saving || uploading}
          hasChanges={hasChanges}
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
        {/* Section 1: Resume Upload */}
        <div className="bg-gray-50 rounded-2xl p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-[#199087] flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">Upload your resume</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                PDF format, up to 10MB
              </p>
            </div>
          </div>

          {/* Uploaded state */}
          {resumeUrl ? (
            <div className="mb-4">
              <div className="flex items-center gap-3 p-4 bg-[#199087]/5 border border-[#199087]/20 rounded-xl">
                <div className="w-12 h-12 rounded-xl bg-[#199087]/10 flex items-center justify-center shrink-0">
                  <svg className="w-6 h-6 text-[#199087]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-[#199087]">
                      {resumeFile ? resumeFile.name : "Resume uploaded"}
                    </p>
                    {resumeJustSaved && (
                      <span className="px-2 py-0.5 bg-[#199087] text-white text-[10px] font-medium rounded-full animate-pulse">
                        Saved!
                      </span>
                    )}
                  </div>
                  {resumeFile && (
                    <p className="text-xs text-[#199087]/70">{formatFileSize(resumeFile.size)}</p>
                  )}
                  {!resumeFile && hadResumeOnOpen && (
                    <p className="text-xs text-[#199087]/70">Previously uploaded</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={uploading}
                  className="text-sm font-medium text-[#199087] hover:text-[#157a72] px-3 py-1.5 rounded-lg hover:bg-[#199087]/10 transition-colors"
                >
                  Replace
                </button>
              </div>
            </div>
          ) : (
            /* Drop zone */
            <div
              onDragEnter={(e) => handleDrag(e, true)}
              onDragLeave={(e) => handleDrag(e, false)}
              onDragOver={(e) => handleDrag(e, true)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`relative flex flex-col items-center justify-center py-10 px-6 bg-white border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200 ${
                dragActive
                  ? "border-[#199087] bg-[#199087]/5 scale-[1.01]"
                  : uploading
                  ? "border-gray-200 bg-gray-50"
                  : "border-gray-200 hover:border-[#199087]/50 hover:bg-gray-50"
              }`}
            >
              {uploading ? (
                <>
                  <div className="w-10 h-10 border-[3px] border-gray-200 border-t-[#199087] rounded-full animate-spin mb-3" />
                  <p className="text-sm font-medium text-gray-600">Uploading...</p>
                </>
              ) : (
                <>
                  <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                    <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-gray-700 mb-1">
                    {dragActive ? "Drop your resume here" : "Click or drag to upload"}
                  </p>
                  <p className="text-xs text-gray-400">PDF up to 10MB</p>
                </>
              )}
            </div>
          )}

          {/* Tips */}
          <div className="mt-4 p-4 bg-white rounded-xl border border-gray-100">
            <p className="text-xs font-medium text-gray-500 mb-2">A strong caregiver resume includes:</p>
            <ul className="text-xs text-gray-400 space-y-1">
              <li className="flex items-start gap-2">
                <span className="text-[#199087] mt-0.5">•</span>
                Caregiving, volunteer, or clinical experience
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#199087] mt-0.5">•</span>
                Certifications (CNA, BLS, CPR)
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#199087] mt-0.5">•</span>
                Soft skills: communication, empathy, reliability
              </li>
            </ul>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
            }}
          />
        </div>

        {/* Section 2: LinkedIn */}
        <div className="bg-gray-50 rounded-2xl p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-[#0A66C2] flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">LinkedIn profile</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                Optional: Help providers learn more about you
              </p>
            </div>
          </div>

          <div className="relative">
            <input
              type="url"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              placeholder="https://linkedin.com/in/yourname"
              className={`w-full bg-white border rounded-xl px-4 py-3.5 text-sm text-gray-900 placeholder:text-gray-400 transition-all outline-none ${
                linkedinUrl && !isValidLinkedIn(linkedinUrl)
                  ? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
                  : "border-gray-200 focus:border-[#199087] focus:ring-2 focus:ring-[#199087]/20"
              }`}
            />
            {linkedinUrl && isValidLinkedIn(linkedinUrl) && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <svg className="w-5 h-5 text-[#199087]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
          </div>
          {linkedinUrl && !isValidLinkedIn(linkedinUrl) && (
            <p className="text-xs text-red-500 mt-2">
              Enter a valid LinkedIn URL (e.g., https://linkedin.com/in/yourname)
            </p>
          )}
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

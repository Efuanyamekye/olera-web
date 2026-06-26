"use client";

import { useState, useRef, useCallback } from "react";
import Image from "next/image";
import Modal from "@/components/ui/Modal";
import { saveProfile } from "./save-profile";
import { trackProfileEdit } from "@/lib/analytics/track-profile-edit";
import ModalFooter from "./ModalFooter";
import type { BaseEditModalProps } from "./types";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

interface UploadingFile {
  id: string;
  name: string;
  preview: string;
}

export default function EditGalleryModal({
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
  const [images, setImages] = useState<string[]>(Array.isArray(metadata.images) ? metadata.images : []);
  const [profilePhoto, setProfilePhoto] = useState<string>(profile.image_url || "");
  const [uploading, setUploading] = useState<UploadingFile[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasChanges =
    JSON.stringify(images) !== JSON.stringify(Array.isArray(metadata.images) ? metadata.images : []) ||
    profilePhoto !== (profile.image_url || "");

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      setError(null);
      const fileArray = Array.from(files);

      // Client-side validation
      for (const file of fileArray) {
        if (!ALLOWED_TYPES.includes(file.type)) {
          const ext = file.name.split(".").pop()?.toUpperCase() || "unknown";
          setError(`${ext} files aren't supported. Please use JPEG, PNG, or WebP images.`);
          return;
        }
        if (file.size > MAX_SIZE) {
          const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
          setError(`This image is ${sizeMB}MB — the maximum is 5MB. Try compressing or resizing it before uploading.`);
          return;
        }
      }

      // Create preview placeholders
      const newUploading: UploadingFile[] = fileArray.map((file) => ({
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        name: file.name,
        preview: URL.createObjectURL(file),
      }));
      setUploading((prev) => [...prev, ...newUploading]);

      // Upload each file
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        const uploadEntry = newUploading[i];
        try {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("profileId", profile.id);

          const res = await fetch("/api/profile/upload-image", {
            method: "POST",
            body: formData,
          });

          if (!res.ok) {
            const data = await res.json();
            setError(data.error || `Failed to upload "${file.name}".`);
            setUploading((prev) => prev.filter((u) => u.id !== uploadEntry.id));
            continue;
          }

          const { imageUrl } = await res.json();
          setImages((prev) => [...prev, imageUrl]);
          setUploading((prev) => prev.filter((u) => u.id !== uploadEntry.id));
        } catch {
          setError(`Failed to upload "${file.name}". Please try again.`);
          setUploading((prev) => prev.filter((u) => u.id !== uploadEntry.id));
        } finally {
          URL.revokeObjectURL(uploadEntry.preview);
        }
      }
    },
    [profile.id]
  );

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files?.length) {
      uploadFiles(e.dataTransfer.files);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) {
      uploadFiles(e.target.files);
    }
    // Reset so the same file can be re-selected
    e.target.value = "";
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    if (!hasChanges && !guidedMode) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const topLevelFields: Record<string, unknown> = {};
      if (profilePhoto !== (profile.image_url || "")) {
        topLevelFields.image_url = profilePhoto || null;
      }
      await saveProfile({
        profileId: profile.id,
        topLevelFields,
        metadataFields: { images },
        existingMetadata: (profile.metadata || {}) as Record<string, unknown>,
      });
      if (hasChanges) trackProfileEdit(profile.slug, "gallery");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const isUploading = uploading.length > 0;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Edit Gallery"
      size="2xl"
      footer={
        <ModalFooter
          saving={saving || isUploading}
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
        {/* Drop zone */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer group ${
            isDragOver
              ? "border-primary-400 bg-primary-50/60"
              : "border-warm-200 bg-vanilla-50/50 hover:border-primary-300 hover:bg-primary-50/30"
          }`}
        >
          <div className="flex flex-col items-center py-8 px-4 text-center">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 transition-colors duration-200 ${
                isDragOver
                  ? "bg-primary-100 text-primary-600"
                  : "bg-warm-100 text-warm-400 group-hover:bg-primary-100 group-hover:text-primary-500"
              }`}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                />
              </svg>
            </div>
            <p className="text-[15px] font-medium text-gray-900">
              {isDragOver ? "Drop photos here" : "Upload photos"}
            </p>
            <p className="text-sm text-warm-500 mt-1">
              Drag and drop or click to browse
            </p>
            <p className="text-xs text-warm-400 mt-2">
              JPEG, PNG, or WebP &middot; Max 5MB each
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            aria-label="Upload gallery photos"
          />
        </div>

        {/* Current images grid + uploading placeholders */}
        {(images.length > 0 || uploading.length > 0) && (
          <div className="grid grid-cols-3 gap-3">
            {images.map((src, i) => {
              const isProfilePhoto = src === profilePhoto;
              return (
                <div key={src} className={`relative group rounded-xl overflow-hidden aspect-square ${isProfilePhoto ? "ring-2 ring-primary-500 ring-offset-2" : ""}`}>
                  {/* unoptimized: a just-uploaded Supabase object races the Next
                      image optimizer's server-side fetch — that's the broken
                      thumbnail (until reload) AND the slow part. The bucket is
                      public, so the browser loads it directly + instantly.
                      Owner-only modal, so optimization is moot here. */}
                  <Image
                    src={src}
                    alt={`Gallery photo ${i + 1}`}
                    fill
                    sizes="(max-width: 768px) 33vw, 200px"
                    className="object-cover"
                    unoptimized
                  />
                  {/* Profile photo badge */}
                  {isProfilePhoto && (
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-primary-500 text-white text-[10px] font-semibold uppercase tracking-wide">
                      Profile
                    </div>
                  )}
                  {/* Hover actions */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-200 flex items-end justify-center pb-2 gap-1.5 opacity-0 group-hover:opacity-100">
                    {!isProfilePhoto && (
                      <button
                        type="button"
                        onClick={() => setProfilePhoto(src)}
                        className="px-2.5 py-1 rounded-lg bg-white/90 text-[11px] font-medium text-gray-900 hover:bg-white transition-colors"
                        aria-label={`Set photo ${i + 1} as profile photo`}
                      >
                        Set as profile
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="w-7 h-7 rounded-lg bg-white/90 text-gray-600 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors"
                      aria-label={`Remove photo ${i + 1}`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
            {/* Uploading placeholders */}
            {uploading.map((u) => (
              <div key={u.id} className="relative rounded-xl overflow-hidden aspect-square bg-warm-50">
                <Image
                  src={u.preview}
                  alt={`Uploading ${u.name}`}
                  fill
                  sizes="(max-width: 768px) 33vw, 200px"
                  className="object-cover opacity-50"
                  unoptimized
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                </div>
              </div>
            ))}
          </div>
        )}


        {error && (
          <div className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-100 p-4" role="alert">
            <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <p className="text-sm text-red-700 flex-1">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-red-300 hover:text-red-500 transition-colors shrink-0"
              aria-label="Dismiss error"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

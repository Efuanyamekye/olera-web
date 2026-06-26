"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import { saveProfile } from "./save-profile";
import { trackProfileEdit } from "@/lib/analytics/track-profile-edit";
import ModalFooter from "./ModalFooter";
import type { BaseEditModalProps } from "./types";
import type { StaffInfo } from "@/lib/types";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function EditOwnerModal({
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
  const staff = metadata.staff as StaffInfo | undefined;

  const [name, setName] = useState(staff?.name || "");
  const [position, setPosition] = useState(staff?.position || "");
  const [bio, setBio] = useState(staff?.bio || "");
  const [careMotivation, setCareMotivation] = useState(staff?.care_motivation || "");
  const [imageUrl, setImageUrl] = useState(staff?.image || "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasChanges =
    name !== (staff?.name || "") ||
    position !== (staff?.position || "") ||
    bio !== (staff?.bio || "") ||
    careMotivation !== (staff?.care_motivation || "") ||
    imageUrl !== (staff?.image || "");

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Please use JPEG, PNG, or WebP images.");
      return;
    }
    if (file.size > MAX_SIZE) {
      setError(`Image is ${(file.size / (1024 * 1024)).toFixed(1)}MB — max is 5MB.`);
      return;
    }

    setUploading(true);
    setError(null);
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
        setError(data.error || "Failed to upload photo.");
        return;
      }

      const { imageUrl: url } = await res.json();
      setImageUrl(url);
    } catch {
      setError("Failed to upload photo. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!hasChanges && !guidedMode) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const staffData: StaffInfo = {
        name: name.trim(),
        position: position.trim(),
        bio: bio.trim(),
        image: imageUrl,
        care_motivation: careMotivation.trim() || undefined,
      };
      await saveProfile({
        profileId: profile.id,
        metadataFields: { staff: staffData },
        existingMetadata: (profile.metadata || {}) as Record<string, unknown>,
      });
      if (hasChanges) trackProfileEdit(profile.slug, "owner");
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
      title="Edit Facility Manager"
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
        {/* Photo upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Photo</label>
          <div className="flex items-center gap-4">
            <div className="relative w-20 h-20 flex-shrink-0">
              {imageUrl ? (
                <Image
                  src={imageUrl}
                  alt={name || "Owner photo"}
                  width={80}
                  height={80}
                  className="w-20 h-20 rounded-full object-cover"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
                  <span className="text-2xl font-bold text-gray-400">
                    {name ? getInitials(name) : "?"}
                  </span>
                </div>
              )}
              {uploading && (
                <div className="absolute inset-0 rounded-full bg-black/30 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="px-4 py-2 text-sm font-medium text-primary-600 border border-primary-300 rounded-lg hover:bg-primary-50 transition-colors disabled:opacity-50"
              >
                {imageUrl ? "Change photo" : "Upload photo"}
              </button>
              {imageUrl && (
                <button
                  type="button"
                  onClick={() => setImageUrl("")}
                  className="px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePhotoUpload}
              className="hidden"
              aria-label="Upload owner photo"
            />
          </div>
        </div>

        {/* Name & Position */}
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Full Name"
            value={name}
            onChange={(e) => setName((e.target as HTMLInputElement).value)}
            placeholder="e.g. John Hagemier"
            required
          />
          <Input
            label="Title / Position"
            value={position}
            onChange={(e) => setPosition((e.target as HTMLInputElement).value)}
            placeholder="e.g. Owner & Manager"
          />
        </div>

        {/* Care Motivation */}
        <Input
          as="textarea"
          label="Care Motivation"
          value={careMotivation}
          onChange={(e) => setCareMotivation((e.target as HTMLTextAreaElement).value)}
          rows={4}
          placeholder="Why did you start this care home? What drives you to provide great care?"
        />

        {/* Bio (optional, secondary) */}
        <Input
          as="textarea"
          label="Short Bio (optional)"
          value={bio}
          onChange={(e) => setBio((e.target as HTMLTextAreaElement).value)}
          rows={3}
          placeholder="Background, experience, credentials..."
        />

        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}

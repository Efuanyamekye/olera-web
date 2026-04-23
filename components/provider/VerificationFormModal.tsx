"use client";

import { useState, useEffect } from "react";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";

export interface VerificationSubmission {
  name: string;
  email: string;
  role: string;
  phone: string;
  notes: string;
  documentUrl: string | null;
  /** LinkedIn profile URL - required if no businessWebsiteUrl */
  linkedinUrl: string;
  /** Business website showing the person's name - required if no linkedinUrl */
  businessWebsiteUrl: string;
  /** If true, user couldn't provide LinkedIn or website, needs manual review */
  manualReviewRequested: boolean;
}

export interface ExistingVerificationData {
  name: string;
  email?: string | null;
  role: string;
  phone?: string | null;
  notes?: string | null;
  // Legacy field for backwards compatibility
  affiliation?: string | null;
  submitted_at?: string;
  linkedinUrl?: string | null;
  businessWebsiteUrl?: string | null;
  manualReviewRequested?: boolean;
}

interface VerificationFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: VerificationSubmission) => Promise<void>;
  businessName: string;
  /** User's email from auth (pre-filled) */
  userEmail?: string;
  /** If true, shows "I'll do this later" option */
  allowDismiss?: boolean;
  onDismiss?: () => void;
  /** Pre-fill form with existing data (for updates) */
  existingData?: ExistingVerificationData;
  /** Whether this is an update to an existing submission */
  isUpdate?: boolean;
}

const ROLE_OPTIONS = [
  { value: "owner", label: "Owner" },
  { value: "administrator", label: "Administrator" },
  { value: "executive_director", label: "Executive Director" },
  { value: "office_manager", label: "Office Manager" },
  { value: "marketing", label: "Marketing / Communications" },
  { value: "staff", label: "Staff Member" },
  { value: "other", label: "Other" },
];

export default function VerificationFormModal({
  isOpen,
  onClose,
  onSubmit,
  businessName,
  userEmail,
  allowDismiss = true,
  onDismiss,
  existingData,
  isUpdate = false,
}: VerificationFormModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [businessWebsiteUrl, setBusinessWebsiteUrl] = useState("");
  const [manualReviewRequested, setManualReviewRequested] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset/pre-fill form state when modal opens
  useEffect(() => {
    if (isOpen) {
      // Pre-fill with existing data if available (for updates)
      setName(existingData?.name || "");
      setEmail(existingData?.email || userEmail || "");
      setRole(existingData?.role || "");
      setPhone(existingData?.phone || "");
      // Support both new 'notes' and legacy 'affiliation' field
      setNotes(existingData?.notes || existingData?.affiliation || "");
      setLinkedinUrl(existingData?.linkedinUrl || "");
      setBusinessWebsiteUrl(existingData?.businessWebsiteUrl || "");
      setManualReviewRequested(existingData?.manualReviewRequested || false);
      setError(null);
      setSubmitting(false);
    }
  }, [isOpen, existingData, userEmail]);

  // Validation: name and role required, plus at least one of: LinkedIn, website, or manual review
  const hasVerificationSource = linkedinUrl.trim().length > 0 || businessWebsiteUrl.trim().length > 0 || manualReviewRequested;
  const isValid = name.trim().length > 0 && role.length > 0 && hasVerificationSource;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      await onSubmit({
        name: name.trim(),
        email: email.trim(),
        role,
        phone: phone.trim(),
        notes: notes.trim(),
        documentUrl: null, // Document upload to be added later
        linkedinUrl: linkedinUrl.trim(),
        businessWebsiteUrl: businessWebsiteUrl.trim(),
        manualReviewRequested,
      });
      // Note: Parent handles navigation after successful submit, no need to call onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDismiss = () => {
    if (onDismiss) {
      onDismiss();
    }
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isUpdate ? "Update Verification" : "Verify Your Business"}
      size="xl"
      footer={
        <div className="space-y-3 pt-5 border-t border-gray-100">
          <button
            type="submit"
            form="verification-form"
            disabled={!isValid || submitting}
            className="w-full py-3.5 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all min-h-[52px] flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Submitting...</span>
              </>
            ) : (
              isUpdate ? "Update Submission" : "Submit for Review"
            )}
          </button>
          {allowDismiss && !isUpdate && (
            <button
              type="button"
              onClick={handleDismiss}
              className="w-full py-3 text-gray-500 hover:text-gray-700 font-medium transition-colors text-sm"
            >
              I&apos;ll do this later
            </button>
          )}
          <p className="text-xs text-gray-400 text-center leading-relaxed">
            {isUpdate
              ? "Your updated information will be reviewed within 1-2 business days."
              : "Until verified, contact info remains hidden from families."}
          </p>
        </div>
      }
    >
      <form id="verification-form" onSubmit={handleSubmit} className="space-y-5 pt-2">
        {/* Header description */}
        <div className="pb-1">
          <p className="text-gray-600 text-[15px] leading-relaxed">
            {isUpdate ? (
              <>Update your verification details for <span className="font-medium text-gray-900">{businessName}</span>.</>
            ) : (
              <>Help us confirm you represent <span className="font-medium text-gray-900">{businessName}</span>. We review most requests within 1-2 business days.</>
            )}
          </p>
        </div>

        {/* Name and Email - two columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Name */}
          <div className="space-y-1.5">
            <label htmlFor="ver-name" className="block text-[13px] font-semibold text-gray-700">
              Full name <span className="text-red-500">*</span>
            </label>
            <input
              id="ver-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50/50 text-base placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent focus:ring-primary-300 focus:bg-white transition-all min-h-[48px]"
              required
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label htmlFor="ver-email" className="block text-[13px] font-semibold text-gray-700">
              Email
            </label>
            <input
              id="ver-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50/50 text-base placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent focus:ring-primary-300 focus:bg-white transition-all min-h-[48px]"
            />
          </div>
        </div>

        {/* Role and Phone - two columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Role - using custom Select */}
          <Select
            label="Your role"
            required
            options={ROLE_OPTIONS}
            value={role}
            onChange={setRole}
            placeholder="Select your role..."
          />

          {/* Phone */}
          <div className="space-y-1.5">
            <label htmlFor="ver-phone" className="block text-[13px] font-semibold text-gray-700">
              Phone number <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              id="ver-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 123-4567"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50/50 text-base placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent focus:ring-primary-300 focus:bg-white transition-all min-h-[48px]"
            />
          </div>
        </div>

        {/* Verification Source Section */}
        <div className="space-y-4 pt-2">
          <div className="space-y-1">
            <p className="text-[13px] font-semibold text-gray-700">
              Verify your connection <span className="text-red-500">*</span>
            </p>
            <p className="text-[13px] text-gray-500">
              Provide at least one of the following to help us verify you work at this business.
            </p>
          </div>

          {/* LinkedIn URL */}
          <div className="space-y-1.5">
            <label htmlFor="ver-linkedin" className="block text-[13px] font-semibold text-gray-700">
              LinkedIn profile URL
            </label>
            <input
              id="ver-linkedin"
              type="url"
              value={linkedinUrl}
              onChange={(e) => {
                setLinkedinUrl(e.target.value);
                if (e.target.value.trim()) setManualReviewRequested(false);
              }}
              placeholder="https://linkedin.com/in/yourprofile"
              disabled={manualReviewRequested}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50/50 text-base placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent focus:ring-primary-300 focus:bg-white transition-all min-h-[48px] disabled:bg-gray-100 disabled:text-gray-400"
            />
            <p className="text-xs text-gray-400">
              Your LinkedIn should show you work at {businessName}
            </p>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-gray-200" />
            <span className="text-xs text-gray-400 font-medium">OR</span>
            <div className="flex-1 border-t border-gray-200" />
          </div>

          {/* Business Website URL */}
          <div className="space-y-1.5">
            <label htmlFor="ver-website" className="block text-[13px] font-semibold text-gray-700">
              Business website showing your name
            </label>
            <input
              id="ver-website"
              type="url"
              value={businessWebsiteUrl}
              onChange={(e) => {
                setBusinessWebsiteUrl(e.target.value);
                if (e.target.value.trim()) setManualReviewRequested(false);
              }}
              placeholder="https://yourbusiness.com/about-us"
              disabled={manualReviewRequested}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50/50 text-base placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent focus:ring-primary-300 focus:bg-white transition-all min-h-[48px] disabled:bg-gray-100 disabled:text-gray-400"
            />
            <p className="text-xs text-gray-400">
              A page on your business website that lists you as staff
            </p>
          </div>

          {/* Can't provide either? */}
          <div className="pt-1">
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={manualReviewRequested}
                onChange={(e) => {
                  setManualReviewRequested(e.target.checked);
                  if (e.target.checked) {
                    setLinkedinUrl("");
                    setBusinessWebsiteUrl("");
                  }
                }}
                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
              />
              <div>
                <span className="text-[13px] font-medium text-gray-700 group-hover:text-gray-900">
                  I can&apos;t provide either of these
                </span>
                <p className="text-xs text-gray-500 mt-0.5">
                  We&apos;ll review your submission manually. This may take longer (up to 3 hours during business hours).
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Notes (optional) */}
        <div className="space-y-1.5">
          <label htmlFor="ver-notes" className="block text-[13px] font-semibold text-gray-700">
            Anything else we should know? <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            id="ver-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any additional context that might help us verify your connection to this business..."
            rows={2}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50/50 text-base placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent focus:ring-primary-300 focus:bg-white resize-none transition-all"
          />
        </div>

        {/* Error message with icon */}
        {error && (
          <div className="flex items-start gap-2.5 px-3.5 py-3 bg-red-50 border border-red-100 rounded-xl">
            <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
            <p className="text-sm text-red-700" role="alert">{error}</p>
          </div>
        )}
      </form>
    </Modal>
  );
}

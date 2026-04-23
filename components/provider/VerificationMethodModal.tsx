"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Modal from "@/components/ui/Modal";

// ============================================================
// Types
// ============================================================

export type VerificationMethod = "email" | "linkedin" | "website" | "document";

export interface VerificationResult {
  method: VerificationMethod;
  value: string;
  /** For document uploads, the base64 data */
  documentData?: string;
  /** Document MIME type */
  documentType?: string;
}

interface VerificationMethodModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (result: VerificationResult) => Promise<void>;
  onDismiss?: () => void;
  businessName: string;
  businessWebsite?: string | null;
  /** User's email from auth (for email verification) */
  userEmail?: string;
  /** If true, shows "I'll do this later" option */
  allowDismiss?: boolean;
}

// ============================================================
// Screen States
// ============================================================

type Screen = "pick-method" | "email" | "linkedin" | "website" | "document" | "success";

// ============================================================
// Method Cards Data
// ============================================================

const METHODS = [
  {
    id: "email" as const,
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
      </svg>
    ),
    title: "Business Email",
    description: "Use your company email address",
    hint: "Instant if domain matches",
    recommended: true,
  },
  {
    id: "linkedin" as const,
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <rect x="2" y="2" width="20" height="20" rx="4" />
        <path d="M7 10v7M7 7v.01M11 17v-4.5a2.5 2.5 0 015 0V17M16 10v7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: "LinkedIn Profile",
    description: "Link your professional profile",
    hint: "We check your employment",
  },
  {
    id: "website" as const,
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
      </svg>
    ),
    title: "Business Website",
    description: "Show your name on the staff page",
    hint: "About or team page",
  },
  {
    id: "document" as const,
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
    ),
    title: "Upload Document",
    description: "Business license or ID badge",
    hint: "AI verifies in seconds",
  },
];

// ============================================================
// Validation Helpers
// ============================================================

function isValidEmail(email: string): boolean {
  // Basic email validation - must have @ with text before and after, and a dot after @
  const trimmed = email.trim();
  const atIndex = trimmed.indexOf("@");
  if (atIndex < 1) return false; // Must have at least 1 char before @
  const afterAt = trimmed.slice(atIndex + 1);
  if (afterAt.length < 3) return false; // Must have at least "a.b" after @
  const dotIndex = afterAt.indexOf(".");
  if (dotIndex < 1 || dotIndex === afterAt.length - 1) return false; // Dot can't be first or last
  return true;
}

function isValidLinkedInUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase();
  // Must contain linkedin.com and have something after /in/ or /company/
  if (!trimmed.includes("linkedin.com")) return false;
  const hasProfile = /linkedin\.com\/in\/[a-z0-9_-]+/i.test(trimmed);
  const hasCompany = /linkedin\.com\/company\/[a-z0-9_-]+/i.test(trimmed);
  return hasProfile || hasCompany;
}

function isValidWebsiteUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed.length < 5) return false;
  // Must look like a URL - either has http(s):// or at least has a dot with content on both sides
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      new URL(trimmed);
      return true;
    } catch {
      return false;
    }
  }
  // No protocol - check for domain pattern
  const dotIndex = trimmed.indexOf(".");
  return dotIndex > 0 && dotIndex < trimmed.length - 1;
}

// ============================================================
// Main Component
// ============================================================

export default function VerificationMethodModal({
  isOpen,
  onClose,
  onSubmit,
  onDismiss,
  businessName,
  businessWebsite,
  userEmail,
  allowDismiss = true,
}: VerificationMethodModalProps) {
  const [screen, setScreen] = useState<Screen>("pick-method");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  // Form values for each method
  const [emailValue, setEmailValue] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentPreview, setDocumentPreview] = useState<string | null>(null);

  // Track previous preview for cleanup
  const prevPreviewRef = useRef<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setScreen("pick-method");
      setSubmitting(false);
      setError(null);
      setIsProcessingFile(false);
      setEmailValue(userEmail || "");
      setLinkedinUrl("");
      setWebsiteUrl(businessWebsite || "");
      setDocumentFile(null);
      setDocumentPreview(null);
    }
  }, [isOpen, userEmail, businessWebsite]);

  // Clean up preview URLs properly
  useEffect(() => {
    // Clean up previous preview when a new one is set
    if (prevPreviewRef.current && prevPreviewRef.current !== documentPreview) {
      URL.revokeObjectURL(prevPreviewRef.current);
    }
    prevPreviewRef.current = documentPreview;

    // Cleanup on unmount
    return () => {
      if (prevPreviewRef.current) {
        URL.revokeObjectURL(prevPreviewRef.current);
      }
    };
  }, [documentPreview]);

  const handleMethodSelect = (method: VerificationMethod) => {
    setScreen(method);
    setError(null);
  };

  const handleBack = () => {
    setScreen("pick-method");
    setError(null);
  };

  const handleDismiss = () => {
    if (onDismiss) {
      onDismiss();
    }
    onClose();
  };

  const handleSubmit = async (method: VerificationMethod, value: string, documentData?: string, documentType?: string) => {
    setSubmitting(true);
    setError(null);

    try {
      await onSubmit({ method, value, documentData, documentType });
      setScreen("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDocumentSubmit = useCallback(async () => {
    if (!documentFile || isProcessingFile) return;

    setIsProcessingFile(true);
    setError(null);

    try {
      // Convert file to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64Data = result.split(",")[1]; // Remove data URL prefix
          resolve(base64Data);
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(documentFile);
      });

      setIsProcessingFile(false);
      await handleSubmit("document", documentFile.name, base64, documentFile.type);
    } catch (err) {
      setIsProcessingFile(false);
      setError(err instanceof Error ? err.message : "Failed to process file");
    }
  }, [documentFile, isProcessingFile]);

  const handleDocumentSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!validTypes.includes(file.type)) {
      setError("Please upload a JPG, PNG, or PDF file.");
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      setError("File must be under 10MB.");
      return;
    }

    setDocumentFile(file);
    setError(null);

    // Create preview for images
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setDocumentPreview(url);
    } else {
      setDocumentPreview(null);
    }
  }, []);

  // Get modal title based on screen
  const getTitle = () => {
    switch (screen) {
      case "pick-method":
        return "Verify your business";
      case "email":
        return "Business email";
      case "linkedin":
        return "LinkedIn profile";
      case "website":
        return "Business website";
      case "document":
        return "Upload document";
      case "success":
        return null; // Success screen has custom layout
    }
  };

  // Get modal subtitle based on screen (shown in fixed header area)
  const getSubtitle = () => {
    switch (screen) {
      case "pick-method":
        return (
          <p className="text-gray-600 text-[15px] leading-relaxed">
            Pick one way to confirm you represent{" "}
            <span className="font-medium text-gray-900">{businessName}</span>.
            This usually takes under a minute.
          </p>
        );
      default:
        return null;
    }
  };

  // Render content based on screen
  const renderContent = () => {
    switch (screen) {
      case "pick-method":
        return <PickMethodScreen onSelect={handleMethodSelect} />;
      case "email":
        return (
          <EmailScreen
            value={emailValue}
            onChange={setEmailValue}
            onSubmit={() => handleSubmit("email", emailValue.trim())}
            submitting={submitting}
            error={error}
            businessName={businessName}
          />
        );
      case "linkedin":
        return (
          <LinkedInScreen
            value={linkedinUrl}
            onChange={setLinkedinUrl}
            onSubmit={() => handleSubmit("linkedin", linkedinUrl.trim())}
            submitting={submitting}
            error={error}
            businessName={businessName}
          />
        );
      case "website":
        return (
          <WebsiteScreen
            value={websiteUrl}
            onChange={setWebsiteUrl}
            onSubmit={() => handleSubmit("website", websiteUrl.trim())}
            submitting={submitting}
            error={error}
            businessName={businessName}
          />
        );
      case "document":
        return (
          <DocumentScreen
            file={documentFile}
            preview={documentPreview}
            onFileSelect={handleDocumentSelect}
            onSubmit={handleDocumentSubmit}
            submitting={submitting || isProcessingFile}
            error={error}
            businessName={businessName}
          />
        );
      case "success":
        return <SuccessScreen businessName={businessName} onClose={onClose} />;
    }
  };

  // Render footer based on screen
  const renderFooter = () => {
    if (screen === "success") return null;

    if (screen === "pick-method" && allowDismiss) {
      return (
        <div className="pt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={handleDismiss}
            className="w-full py-3 text-gray-500 hover:text-gray-700 font-medium transition-colors text-sm"
          >
            I&apos;ll do this later
          </button>
        </div>
      );
    }

    return null;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={getTitle()}
      subtitle={getSubtitle()}
      size="2xl"
      onBack={screen !== "pick-method" && screen !== "success" ? handleBack : undefined}
      footer={renderFooter()}
    >
      <div
        key={screen}
        className="animate-fade-in"
        style={{ animation: "fade-slide-in 0.2s ease-out both" }}
      >
        {renderContent()}
      </div>

      {/* Screen transition animation */}
      <style jsx>{`
        @keyframes fade-slide-in {
          from {
            opacity: 0;
            transform: translateX(8px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </Modal>
  );
}

// ============================================================
// Screen Components
// ============================================================

function PickMethodScreen({
  onSelect,
}: {
  onSelect: (method: VerificationMethod) => void;
}) {
  return (
    <div className="pt-2">
      <div className="space-y-3">
        {METHODS.map((method, index) => (
          <button
            key={method.id}
            onClick={() => onSelect(method.id)}
            className="group w-full text-left p-4 sm:p-5 rounded-2xl border border-gray-200 bg-white shadow-sm hover:shadow-md hover:border-primary-300 hover:bg-gradient-to-r hover:from-primary-50/40 hover:to-white active:scale-[0.99] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2"
            style={{
              animation: `fade-slide-up 0.25s ease-out ${index * 50}ms both`,
            }}
          >
            <div className="flex items-center gap-4">
              {/* Icon container */}
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 group-hover:from-primary-100 group-hover:to-primary-50 flex items-center justify-center text-gray-500 group-hover:text-primary-600 transition-all duration-200 shrink-0 shadow-sm">
                {method.icon}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-semibold text-gray-900 text-[15px] group-hover:text-primary-900 transition-colors">
                    {method.title}
                  </span>
                  {method.recommended && (
                    <span className="px-2 py-0.5 bg-gradient-to-r from-primary-500 to-primary-600 text-white text-[11px] font-semibold rounded-full shadow-sm">
                      Recommended
                    </span>
                  )}
                </div>
                <p className="text-gray-500 text-sm group-hover:text-gray-600 transition-colors">{method.description}</p>
                <p className="text-gray-400 text-xs mt-1">{method.hint}</p>
              </div>

              {/* Arrow */}
              <div className="text-gray-300 group-hover:text-primary-500 group-hover:translate-x-0.5 transition-all duration-200 shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </div>
            </div>
          </button>
        ))}
      </div>

      <style jsx>{`
        @keyframes fade-slide-up {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

function EmailScreen({
  value,
  onChange,
  onSubmit,
  submitting,
  error,
  businessName,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
  businessName: string;
}) {
  const isValid = isValidEmail(value);

  return (
    <div className="py-2">
      <p className="text-gray-600 text-[15px] leading-relaxed mb-6">
        Enter your work email address. If it matches{" "}
        <span className="font-medium text-gray-900">{businessName}</span>&apos;s domain,
        you&apos;ll be verified instantly.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (isValid && !submitting) onSubmit();
        }}
        className="space-y-5"
      >
        <div className="space-y-2">
          <label htmlFor="ver-email" className="block text-sm font-semibold text-gray-700">
            Work email address
          </label>
          <input
            id="ver-email"
            type="email"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="you@company.com"
            autoComplete="email"
            autoFocus
            className="w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-gray-50/50 text-base placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent focus:ring-primary-400 focus:bg-white transition-all shadow-sm"
          />
          <p className="text-xs text-gray-400 leading-relaxed">
            Use an email ending in your company&apos;s domain for instant verification.
          </p>
        </div>

        {error && <ErrorMessage message={error} />}

        <SubmitButton
          label="Continue"
          loadingLabel="Verifying..."
          disabled={!isValid}
          submitting={submitting}
        />
      </form>
    </div>
  );
}

function LinkedInScreen({
  value,
  onChange,
  onSubmit,
  submitting,
  error,
  businessName,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
  businessName: string;
}) {
  const isValid = isValidLinkedInUrl(value);

  return (
    <div className="py-2">
      <p className="text-gray-600 text-[15px] leading-relaxed mb-6">
        Share your LinkedIn profile that shows you work at{" "}
        <span className="font-medium text-gray-900">{businessName}</span>.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (isValid && !submitting) onSubmit();
        }}
        className="space-y-5"
      >
        <div className="space-y-2">
          <label htmlFor="ver-linkedin" className="block text-sm font-semibold text-gray-700">
            LinkedIn profile URL
          </label>
          <input
            id="ver-linkedin"
            type="url"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://linkedin.com/in/yourname"
            autoFocus
            className="w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-gray-50/50 text-base placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent focus:ring-primary-400 focus:bg-white transition-all shadow-sm"
          />
          <p className="text-xs text-gray-400 leading-relaxed">
            Your profile should list {businessName} as your current employer.
          </p>
        </div>

        {error && <ErrorMessage message={error} />}

        <SubmitButton
          label="Verify with LinkedIn"
          loadingLabel="Verifying..."
          disabled={!isValid}
          submitting={submitting}
        />
      </form>
    </div>
  );
}

function WebsiteScreen({
  value,
  onChange,
  onSubmit,
  submitting,
  error,
  businessName,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
  businessName: string;
}) {
  const isValid = isValidWebsiteUrl(value);

  return (
    <div className="py-2">
      <p className="text-gray-600 text-[15px] leading-relaxed mb-6">
        Link to a page on your business website that shows your name as staff at{" "}
        <span className="font-medium text-gray-900">{businessName}</span>.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (isValid && !submitting) onSubmit();
        }}
        className="space-y-5"
      >
        <div className="space-y-2">
          <label htmlFor="ver-website" className="block text-sm font-semibold text-gray-700">
            Website page URL
          </label>
          <input
            id="ver-website"
            type="url"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://yourbusiness.com/about-us"
            autoFocus
            className="w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-gray-50/50 text-base placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent focus:ring-primary-400 focus:bg-white transition-all shadow-sm"
          />
          <p className="text-xs text-gray-400 leading-relaxed">
            An about page, team page, or staff directory that includes your name.
          </p>
        </div>

        {error && <ErrorMessage message={error} />}

        <SubmitButton
          label="Verify with website"
          loadingLabel="Verifying..."
          disabled={!isValid}
          submitting={submitting}
        />
      </form>
    </div>
  );
}

function DocumentScreen({
  file,
  preview,
  onFileSelect,
  onSubmit,
  submitting,
  error,
  businessName,
}: {
  file: File | null;
  preview: string | null;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
  businessName: string;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && inputRef.current) {
      // Create a DataTransfer to set the file
      const dt = new DataTransfer();
      dt.items.add(droppedFile);
      inputRef.current.files = dt.files;
      // Trigger the change event
      const event = new Event("change", { bubbles: true });
      inputRef.current.dispatchEvent(event);
    }
  }, []);

  return (
    <div className="py-2">
      <p className="text-gray-600 text-[15px] leading-relaxed mb-6">
        Upload a photo of your business license, ID badge, or official letter showing your connection to{" "}
        <span className="font-medium text-gray-900">{businessName}</span>.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (file && !submitting) onSubmit();
        }}
        className="space-y-5"
      >
        <div className="space-y-3">
          <label className="block text-sm font-semibold text-gray-700">
            Document or photo
          </label>

          {/* Upload area */}
          <label
            htmlFor="ver-document"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative flex flex-col items-center justify-center w-full min-h-[200px] rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer ${
              isDragging
                ? "border-primary-400 bg-primary-50 scale-[1.01]"
                : file
                  ? "border-primary-300 bg-gradient-to-br from-primary-50/50 to-white"
                  : "border-gray-200 bg-gray-50/50 hover:border-gray-300 hover:bg-gray-50"
            }`}
          >
            {preview ? (
              // Image preview
              <div className="relative w-full h-52 p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt="Document preview"
                  className="w-full h-full object-contain rounded-xl"
                />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/40 rounded-2xl m-4">
                  <span className="text-white text-sm font-medium px-4 py-2 bg-black/50 rounded-lg">
                    Click to change
                  </span>
                </div>
              </div>
            ) : file ? (
              // PDF or non-image file
              <div className="flex flex-col items-center gap-3 py-8">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center shadow-sm">
                  <svg className="w-8 h-8 text-primary-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="font-semibold text-gray-900 text-sm">{file.name}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {(file.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                </div>
                <p className="text-xs text-primary-600 font-medium hover:text-primary-700">Tap to change</p>
              </div>
            ) : (
              // Empty state
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-50 flex items-center justify-center shadow-sm">
                  <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="font-semibold text-gray-900 text-sm">
                    Drop your file here or tap to upload
                  </p>
                  <p className="text-xs text-gray-500 mt-1.5">
                    JPG, PNG, or PDF up to 10MB
                  </p>
                </div>
              </div>
            )}
            <input
              ref={inputRef}
              id="ver-document"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={onFileSelect}
              className="sr-only"
            />
          </label>

          <p className="text-xs text-gray-400 leading-relaxed">
            We use AI to verify your document instantly. Your file is encrypted and deleted after verification.
          </p>
        </div>

        {error && <ErrorMessage message={error} />}

        <SubmitButton
          label="Verify document"
          loadingLabel={submitting ? "Verifying..." : "Processing..."}
          disabled={!file}
          submitting={submitting}
        />
      </form>
    </div>
  );
}

function SuccessScreen({
  businessName,
  onClose,
}: {
  businessName: string;
  onClose: () => void;
}) {
  return (
    <div className="py-10 text-center">
      {/* Success icon with animation */}
      <div
        className="w-24 h-24 mx-auto mb-8 rounded-full bg-gradient-to-br from-green-100 to-emerald-50 flex items-center justify-center shadow-lg shadow-green-100/50"
        style={{ animation: "success-pop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) both" }}
      >
        <svg
          className="w-12 h-12 text-green-500"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2.5}
          stroke="currentColor"
          style={{ animation: "check-draw 0.4s ease-out 0.2s both" }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      </div>

      {/* Message */}
      <h3
        className="text-2xl font-bold text-gray-900 mb-3"
        style={{ animation: "fade-up 0.3s ease-out 0.3s both" }}
      >
        You&apos;re verified!
      </h3>
      <p
        className="text-gray-600 text-[15px] leading-relaxed mb-10 max-w-sm mx-auto"
        style={{ animation: "fade-up 0.3s ease-out 0.4s both" }}
      >
        You now have full access to manage{" "}
        <span className="font-medium text-gray-900">{businessName}</span>&apos;s profile on Olera.
      </p>

      {/* CTA */}
      <button
        onClick={onClose}
        className="px-10 py-4 bg-gray-900 hover:bg-gray-800 text-white font-semibold rounded-xl transition-all shadow-lg shadow-gray-900/20 hover:shadow-xl hover:shadow-gray-900/25 hover:-translate-y-0.5"
        style={{ animation: "fade-up 0.3s ease-out 0.5s both" }}
      >
        Continue to dashboard
      </button>

      <style jsx>{`
        @keyframes success-pop {
          0% {
            opacity: 0;
            transform: scale(0.5);
          }
          70% {
            transform: scale(1.1);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes check-draw {
          from {
            stroke-dasharray: 100;
            stroke-dashoffset: 100;
          }
          to {
            stroke-dasharray: 100;
            stroke-dashoffset: 0;
          }
        }
        @keyframes fade-up {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

// ============================================================
// Shared Components
// ============================================================

function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3.5 bg-red-50 border border-red-100 rounded-xl">
      <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
        <svg className="w-3 h-3 text-red-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </div>
      <p className="text-sm text-red-700 leading-relaxed" role="alert">{message}</p>
    </div>
  );
}

function SubmitButton({
  label,
  loadingLabel,
  disabled,
  submitting,
}: {
  label: string;
  loadingLabel: string;
  disabled: boolean;
  submitting: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={disabled || submitting}
      className="w-full py-4 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all min-h-[56px] flex items-center justify-center gap-2.5 shadow-sm hover:shadow-md disabled:shadow-none"
    >
      {submitting ? (
        <>
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>{loadingLabel}</span>
        </>
      ) : (
        label
      )}
    </button>
  );
}

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
  /** User's full name for matching */
  fullName: string;
  /** For document uploads, the base64 data */
  documentData?: string;
  /** Document MIME type */
  documentType?: string;
}

interface VerificationMethodModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (result: VerificationResult) => Promise<{ verified: boolean; pendingReview: boolean } | void>;
  onDismiss?: () => void;
  businessName: string;
  businessWebsite?: string | null;
  /** User's email from auth (for email verification) */
  userEmail?: string;
  /** User's display name from profile */
  userName?: string;
  /** If true, shows "I'll do this later" option */
  allowDismiss?: boolean;
}

// ============================================================
// Screen States
// ============================================================

type Screen = "pick-method" | "email" | "linkedin" | "website" | "document" | "success" | "pending-review" | "need-help";

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
    description: "Verify with your company email",
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
    description: "Show your employment history",
    hint: "We check your current role",
  },
  {
    id: "website" as const,
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
      </svg>
    ),
    title: "Business Website",
    description: "Link to your staff page",
    hint: "About or team page works",
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

function isValidName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 2 && trimmed.includes(" ") === false ? trimmed.length >= 2 : trimmed.split(/\s+/).filter(Boolean).length >= 1;
}

function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  const atIndex = trimmed.indexOf("@");
  if (atIndex < 1) return false;
  const afterAt = trimmed.slice(atIndex + 1);
  if (afterAt.length < 3) return false;
  const dotIndex = afterAt.indexOf(".");
  if (dotIndex < 1 || dotIndex === afterAt.length - 1) return false;
  return true;
}

function isValidLinkedInUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase();
  if (!trimmed.includes("linkedin.com")) return false;
  const hasProfile = /linkedin\.com\/in\/[a-z0-9_-]+/i.test(trimmed);
  const hasCompany = /linkedin\.com\/company\/[a-z0-9_-]+/i.test(trimmed);
  return hasProfile || hasCompany;
}

function isValidWebsiteUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed.length < 5) return false;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      new URL(trimmed);
      return true;
    } catch {
      return false;
    }
  }
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
  userName,
  allowDismiss = true,
}: VerificationMethodModalProps) {
  const [screen, setScreen] = useState<Screen>("pick-method");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  // Track which verification methods have been tried
  const [triedMethods, setTriedMethods] = useState<Set<VerificationMethod>>(new Set());

  // Shared name field (persists across method switches)
  const [fullName, setFullName] = useState("");

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
      setTriedMethods(new Set());
      setIsProcessingFile(false);
      setFullName(userName || "");
      setEmailValue(userEmail || "");
      setLinkedinUrl("");
      setWebsiteUrl(businessWebsite || "");
      setDocumentFile(null);
      setDocumentPreview(null);
    }
  }, [isOpen, userEmail, userName, businessWebsite]);

  // Clean up preview URLs
  useEffect(() => {
    if (prevPreviewRef.current && prevPreviewRef.current !== documentPreview) {
      URL.revokeObjectURL(prevPreviewRef.current);
    }
    prevPreviewRef.current = documentPreview;
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
    if (onDismiss) onDismiss();
    onClose();
  };

  const handleSubmit = async (method: VerificationMethod, value: string, documentData?: string, documentType?: string) => {
    setSubmitting(true);
    setError(null);

    try {
      const result = await onSubmit({ method, value, fullName: fullName.trim(), documentData, documentType });
      if (result?.verified) {
        setScreen("success");
      } else if (result?.pendingReview) {
        const alreadyTried = triedMethods.has(method);
        setTriedMethods(prev => new Set(prev).add(method));
        const distinctMethodsTried = alreadyTried ? triedMethods.size : triedMethods.size + 1;

        if (distinctMethodsTried >= 4) {
          setScreen("pending-review");
        } else {
          setError("We couldn't verify automatically. Try another method.");
        }
      } else {
        setScreen("success");
      }
    } catch (err) {
      setTriedMethods(prev => new Set(prev).add(method));
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleNeedHelp = () => {
    setScreen("need-help");
    setError(null);
  };

  const handleDocumentSubmit = useCallback(async () => {
    if (!documentFile || isProcessingFile) return;

    setIsProcessingFile(true);
    setError(null);

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64Data = result.split(",")[1];
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
  }, [documentFile, isProcessingFile, fullName]);

  const handleDocumentSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!validTypes.includes(file.type)) {
      setError("Please upload a JPG, PNG, or PDF file.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("File must be under 10MB.");
      return;
    }

    setDocumentFile(file);
    setError(null);

    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setDocumentPreview(url);
    } else {
      setDocumentPreview(null);
    }
  }, []);

  // Get modal title
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
      case "pending-review":
      case "need-help":
        return null;
    }
  };

  // Subtitle only for method picker
  const getSubtitle = () => {
    if (screen === "pick-method") {
      return (
        <p className="text-gray-500 text-[15px]">
          Confirm you represent <span className="font-medium text-gray-700">{businessName}</span>
        </p>
      );
    }
    return null;
  };

  // Render content
  const renderContent = () => {
    switch (screen) {
      case "pick-method":
        return (
          <PickMethodScreen
            onSelect={handleMethodSelect}
            triedMethods={triedMethods}
            onNeedHelp={handleNeedHelp}
          />
        );
      case "email":
        return (
          <EmailScreen
            fullName={fullName}
            onFullNameChange={setFullName}
            email={emailValue}
            onEmailChange={setEmailValue}
            onSubmit={() => handleSubmit("email", emailValue.trim())}
            submitting={submitting}
            error={error}
            onTryAnother={handleBack}
            showTryAnother={triedMethods.has("email")}
          />
        );
      case "linkedin":
        return (
          <LinkedInScreen
            fullName={fullName}
            onFullNameChange={setFullName}
            url={linkedinUrl}
            onUrlChange={setLinkedinUrl}
            onSubmit={() => handleSubmit("linkedin", linkedinUrl.trim())}
            submitting={submitting}
            error={error}
            businessName={businessName}
            onTryAnother={handleBack}
            showTryAnother={triedMethods.has("linkedin")}
          />
        );
      case "website":
        return (
          <WebsiteScreen
            fullName={fullName}
            onFullNameChange={setFullName}
            url={websiteUrl}
            onUrlChange={setWebsiteUrl}
            onSubmit={() => handleSubmit("website", websiteUrl.trim())}
            submitting={submitting}
            error={error}
            onTryAnother={handleBack}
            showTryAnother={triedMethods.has("website")}
          />
        );
      case "document":
        return (
          <DocumentScreen
            fullName={fullName}
            onFullNameChange={setFullName}
            file={documentFile}
            preview={documentPreview}
            onFileSelect={handleDocumentSelect}
            onSubmit={handleDocumentSubmit}
            submitting={submitting || isProcessingFile}
            error={error}
            onTryAnother={handleBack}
            showTryAnother={triedMethods.has("document")}
          />
        );
      case "success":
        return <SuccessScreen businessName={businessName} onClose={onClose} />;
      case "pending-review":
        return <PendingReviewScreen businessName={businessName} onClose={onClose} />;
      case "need-help":
        return <NeedHelpScreen businessName={businessName} onClose={onClose} />;
    }
  };

  // Footer
  const renderFooter = () => {
    if (screen === "success" || screen === "pending-review" || screen === "need-help") return null;

    if (screen === "pick-method" && allowDismiss) {
      return (
        <div className="pt-3">
          <button
            type="button"
            onClick={handleDismiss}
            className="w-full py-3 text-gray-400 hover:text-gray-600 font-medium transition-colors text-sm"
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
      size="md"
      onBack={screen !== "pick-method" && screen !== "success" && screen !== "pending-review" && screen !== "need-help" ? handleBack : undefined}
      footer={renderFooter()}
    >
      <div
        key={screen}
        style={{ animation: "verifyFadeIn 0.2s ease-out both" }}
      >
        {renderContent()}
      </div>

      <style jsx>{`
        @keyframes verifyFadeIn {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
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
  triedMethods,
  onNeedHelp,
}: {
  onSelect: (method: VerificationMethod) => void;
  triedMethods: Set<VerificationMethod>;
  onNeedHelp: () => void;
}) {
  const hasTriedMethods = triedMethods.size > 0;

  return (
    <div className="py-1">
      {/* Message if returning after failed attempt */}
      {hasTriedMethods && (
        <div className="mb-4 px-4 py-3 bg-amber-50/80 border border-amber-100 rounded-xl">
          <p className="text-sm text-amber-700 font-medium">
            Try another method below
          </p>
        </div>
      )}

      <div className="space-y-2.5">
        {METHODS.map((method, index) => {
          const wasTried = triedMethods.has(method.id);

          return (
            <button
              key={method.id}
              onClick={() => onSelect(method.id)}
              className={`
                group w-full text-left p-4 rounded-xl border transition-all duration-150
                focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2
                ${wasTried
                  ? "border-gray-100 bg-gray-50/50"
                  : "border-gray-200 bg-white hover:border-primary-200 hover:bg-primary-50/30 active:scale-[0.99]"
                }
              `}
              style={{ animation: `methodSlide 0.2s ease-out ${index * 40}ms both` }}
            >
              <div className="flex items-center gap-4">
                {/* Icon */}
                <div className={`
                  w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors
                  ${wasTried
                    ? "bg-gray-100 text-gray-400"
                    : "bg-gray-100 text-gray-500 group-hover:bg-primary-100 group-hover:text-primary-600"
                  }
                `}>
                  {method.icon}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold text-[15px] ${wasTried ? "text-gray-400" : "text-gray-900"}`}>
                      {method.title}
                    </span>
                    {wasTried ? (
                      <span className="px-1.5 py-0.5 bg-gray-200 text-gray-500 text-[10px] font-semibold rounded uppercase tracking-wide">
                        Tried
                      </span>
                    ) : method.recommended && !hasTriedMethods ? (
                      <span className="px-2 py-0.5 bg-primary-500 text-white text-[10px] font-semibold rounded-full">
                        Fastest
                      </span>
                    ) : null}
                  </div>
                  <p className={`text-sm ${wasTried ? "text-gray-400" : "text-gray-500"}`}>
                    {method.description}
                  </p>
                </div>

                {/* Arrow */}
                <svg
                  className={`w-5 h-5 shrink-0 transition-all ${wasTried ? "text-gray-300" : "text-gray-300 group-hover:text-primary-400 group-hover:translate-x-0.5"}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </div>
            </button>
          );
        })}
      </div>

      {/* Help link */}
      {hasTriedMethods && (
        <div className="mt-5 text-center">
          <button
            type="button"
            onClick={onNeedHelp}
            className="text-sm text-gray-400 hover:text-primary-600 transition-colors"
          >
            Having trouble? <span className="font-medium underline underline-offset-2">Get help</span>
          </button>
        </div>
      )}

      <style jsx>{`
        @keyframes methodSlide {
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

// ============================================================
// Form Screens (unified structure)
// ============================================================

function EmailScreen({
  fullName,
  onFullNameChange,
  email,
  onEmailChange,
  onSubmit,
  submitting,
  error,
  onTryAnother,
  showTryAnother,
}: {
  fullName: string;
  onFullNameChange: (v: string) => void;
  email: string;
  onEmailChange: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
  onTryAnother: () => void;
  showTryAnother: boolean;
}) {
  const isValid = isValidName(fullName) && isValidEmail(email);

  return (
    <FormWrapper onSubmit={onSubmit} isValid={isValid} submitting={submitting}>
      <FormField label="Your full name" hint="As it appears in company records">
        <input
          type="text"
          value={fullName}
          onChange={(e) => onFullNameChange(e.target.value)}
          placeholder="Jane Smith"
          autoComplete="name"
          autoFocus
          className="form-input"
        />
      </FormField>

      <FormField label="Work email" hint="Use your company domain for instant verification">
        <input
          type="email"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          placeholder="jane@company.com"
          autoComplete="email"
          className="form-input"
        />
      </FormField>

      {error && <ErrorBanner message={error} onTryAnother={onTryAnother} showTryAnother={showTryAnother} />}

      <SubmitButton submitting={submitting} disabled={!isValid} />

      <style jsx>{`
        .form-input {
          width: 100%;
          padding: 14px 16px;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
          background: #fafafa;
          font-size: 15px;
          color: #111827;
          transition: all 0.15s;
        }
        .form-input::placeholder {
          color: #9ca3af;
        }
        .form-input:focus {
          outline: none;
          border-color: #199087;
          background: white;
          box-shadow: 0 0 0 3px rgba(25, 144, 135, 0.1);
        }
      `}</style>
    </FormWrapper>
  );
}

function LinkedInScreen({
  fullName,
  onFullNameChange,
  url,
  onUrlChange,
  onSubmit,
  submitting,
  error,
  businessName,
  onTryAnother,
  showTryAnother,
}: {
  fullName: string;
  onFullNameChange: (v: string) => void;
  url: string;
  onUrlChange: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
  businessName: string;
  onTryAnother: () => void;
  showTryAnother: boolean;
}) {
  const isValid = isValidName(fullName) && isValidLinkedInUrl(url);

  return (
    <FormWrapper onSubmit={onSubmit} isValid={isValid} submitting={submitting}>
      <FormField label="Your full name" hint="As shown on your LinkedIn">
        <input
          type="text"
          value={fullName}
          onChange={(e) => onFullNameChange(e.target.value)}
          placeholder="Jane Smith"
          autoComplete="name"
          autoFocus
          className="form-input"
        />
      </FormField>

      <FormField label="LinkedIn profile URL" hint={`Should show ${businessName} as current employer`}>
        <input
          type="url"
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="linkedin.com/in/janesmith"
          className="form-input"
        />
      </FormField>

      {error && <ErrorBanner message={error} onTryAnother={onTryAnother} showTryAnother={showTryAnother} />}

      <SubmitButton submitting={submitting} disabled={!isValid} />

      <style jsx>{`
        .form-input {
          width: 100%;
          padding: 14px 16px;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
          background: #fafafa;
          font-size: 15px;
          color: #111827;
          transition: all 0.15s;
        }
        .form-input::placeholder {
          color: #9ca3af;
        }
        .form-input:focus {
          outline: none;
          border-color: #199087;
          background: white;
          box-shadow: 0 0 0 3px rgba(25, 144, 135, 0.1);
        }
      `}</style>
    </FormWrapper>
  );
}

function WebsiteScreen({
  fullName,
  onFullNameChange,
  url,
  onUrlChange,
  onSubmit,
  submitting,
  error,
  onTryAnother,
  showTryAnother,
}: {
  fullName: string;
  onFullNameChange: (v: string) => void;
  url: string;
  onUrlChange: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
  onTryAnother: () => void;
  showTryAnother: boolean;
}) {
  const isValid = isValidName(fullName) && isValidWebsiteUrl(url);

  return (
    <FormWrapper onSubmit={onSubmit} isValid={isValid} submitting={submitting}>
      <FormField label="Your full name" hint="As it appears on the website">
        <input
          type="text"
          value={fullName}
          onChange={(e) => onFullNameChange(e.target.value)}
          placeholder="Jane Smith"
          autoComplete="name"
          autoFocus
          className="form-input"
        />
      </FormField>

      <FormField label="Staff page URL" hint="About page, team page, or staff directory">
        <input
          type="url"
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="company.com/about"
          className="form-input"
        />
      </FormField>

      {error && <ErrorBanner message={error} onTryAnother={onTryAnother} showTryAnother={showTryAnother} />}

      <SubmitButton submitting={submitting} disabled={!isValid} />

      <style jsx>{`
        .form-input {
          width: 100%;
          padding: 14px 16px;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
          background: #fafafa;
          font-size: 15px;
          color: #111827;
          transition: all 0.15s;
        }
        .form-input::placeholder {
          color: #9ca3af;
        }
        .form-input:focus {
          outline: none;
          border-color: #199087;
          background: white;
          box-shadow: 0 0 0 3px rgba(25, 144, 135, 0.1);
        }
      `}</style>
    </FormWrapper>
  );
}

function DocumentScreen({
  fullName,
  onFullNameChange,
  file,
  preview,
  onFileSelect,
  onSubmit,
  submitting,
  error,
  onTryAnother,
  showTryAnother,
}: {
  fullName: string;
  onFullNameChange: (v: string) => void;
  file: File | null;
  preview: string | null;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
  onTryAnother: () => void;
  showTryAnother: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isValid = isValidName(fullName) && !!file;

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
      const dt = new DataTransfer();
      dt.items.add(droppedFile);
      inputRef.current.files = dt.files;
      const event = new Event("change", { bubbles: true });
      inputRef.current.dispatchEvent(event);
    }
  }, []);

  return (
    <FormWrapper onSubmit={onSubmit} isValid={isValid} submitting={submitting}>
      <FormField label="Your full name" hint="As shown on the document">
        <input
          type="text"
          value={fullName}
          onChange={(e) => onFullNameChange(e.target.value)}
          placeholder="Jane Smith"
          autoComplete="name"
          autoFocus
          className="form-input"
        />
      </FormField>

      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-700">Document photo</p>
        <label
          htmlFor="ver-document"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            relative flex flex-col items-center justify-center w-full min-h-[160px] rounded-xl border-2 border-dashed cursor-pointer transition-all
            ${isDragging
              ? "border-primary-400 bg-primary-50"
              : file
                ? "border-primary-200 bg-primary-50/30"
                : "border-gray-200 bg-gray-50/50 hover:border-gray-300 hover:bg-gray-50"
            }
          `}
        >
          {preview ? (
            <div className="relative w-full h-40 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="Preview"
                className="w-full h-full object-contain rounded-lg"
              />
              <div className="absolute inset-3 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/40 rounded-lg">
                <span className="text-white text-sm font-medium">Change</span>
              </div>
            </div>
          ) : file ? (
            <div className="flex flex-col items-center gap-2 py-6">
              <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-primary-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
              </div>
              <p className="font-medium text-gray-900 text-sm">{file.name}</p>
              <p className="text-xs text-primary-600">Tap to change</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                </svg>
              </div>
              <div className="text-center">
                <p className="font-medium text-gray-900 text-sm">Drop file or tap to upload</p>
                <p className="text-xs text-gray-400 mt-1">JPG, PNG, or PDF</p>
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
        <p className="text-xs text-gray-400">Business license, ID badge, or official letter</p>
      </div>

      {error && <ErrorBanner message={error} onTryAnother={onTryAnother} showTryAnother={showTryAnother} />}

      <SubmitButton submitting={submitting} disabled={!isValid} />

      <style jsx>{`
        .form-input {
          width: 100%;
          padding: 14px 16px;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
          background: #fafafa;
          font-size: 15px;
          color: #111827;
          transition: all 0.15s;
        }
        .form-input::placeholder {
          color: #9ca3af;
        }
        .form-input:focus {
          outline: none;
          border-color: #199087;
          background: white;
          box-shadow: 0 0 0 3px rgba(25, 144, 135, 0.1);
        }
      `}</style>
    </FormWrapper>
  );
}

// ============================================================
// Result Screens
// ============================================================

function SuccessScreen({
  businessName,
  onClose,
}: {
  businessName: string;
  onClose: () => void;
}) {
  return (
    <div className="py-8 text-center">
      {/* Animated checkmark */}
      <div
        className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-emerald-100 to-emerald-50 flex items-center justify-center"
        style={{ animation: "successPop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) both" }}
      >
        <svg
          className="w-10 h-10 text-emerald-500"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2.5}
          stroke="currentColor"
          style={{ animation: "checkDraw 0.3s ease-out 0.2s both" }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      </div>

      <h3
        className="text-xl font-bold text-gray-900 mb-2"
        style={{ animation: "fadeUp 0.3s ease-out 0.25s both" }}
      >
        You&apos;re verified
      </h3>
      <p
        className="text-gray-500 text-[15px] mb-8 max-w-xs mx-auto"
        style={{ animation: "fadeUp 0.3s ease-out 0.35s both" }}
      >
        You now have full access to manage <span className="font-medium text-gray-700">{businessName}</span> on Olera.
      </p>

      <button
        onClick={onClose}
        className="px-8 py-3.5 bg-gray-900 hover:bg-gray-800 text-white font-semibold rounded-xl transition-all hover:-translate-y-0.5 hover:shadow-lg"
        style={{ animation: "fadeUp 0.3s ease-out 0.45s both" }}
      >
        Continue
      </button>

      <style jsx>{`
        @keyframes successPop {
          0% { opacity: 0; transform: scale(0.5); }
          70% { transform: scale(1.1); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes checkDraw {
          from { stroke-dasharray: 100; stroke-dashoffset: 100; }
          to { stroke-dasharray: 100; stroke-dashoffset: 0; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function PendingReviewScreen({
  businessName,
  onClose,
}: {
  businessName: string;
  onClose: () => void;
}) {
  return (
    <div className="py-8 text-center">
      {/* Clock icon */}
      <div
        className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-amber-100 to-amber-50 flex items-center justify-center"
        style={{ animation: "successPop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) both" }}
      >
        <svg className="w-10 h-10 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      </div>

      <h3
        className="text-xl font-bold text-gray-900 mb-2"
        style={{ animation: "fadeUp 0.3s ease-out 0.25s both" }}
      >
        Under review
      </h3>
      <p
        className="text-gray-500 text-[15px] mb-2 max-w-xs mx-auto"
        style={{ animation: "fadeUp 0.3s ease-out 0.35s both" }}
      >
        We&apos;re reviewing your submission for <span className="font-medium text-gray-700">{businessName}</span>.
      </p>
      <p
        className="text-gray-400 text-sm mb-8 max-w-xs mx-auto"
        style={{ animation: "fadeUp 0.3s ease-out 0.4s both" }}
      >
        We&apos;ll email you within 1–2 business days.
      </p>

      <button
        onClick={onClose}
        className="px-8 py-3.5 bg-gray-900 hover:bg-gray-800 text-white font-semibold rounded-xl transition-all hover:-translate-y-0.5 hover:shadow-lg"
        style={{ animation: "fadeUp 0.3s ease-out 0.5s both" }}
      >
        Got it
      </button>

      <style jsx>{`
        @keyframes successPop {
          0% { opacity: 0; transform: scale(0.5); }
          70% { transform: scale(1.1); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function NeedHelpScreen({
  businessName,
  onClose,
}: {
  businessName: string;
  onClose: () => void;
}) {
  return (
    <div className="py-6 text-center">
      {/* Support icon */}
      <div
        className="w-16 h-16 mx-auto mb-5 rounded-full bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center"
        style={{ animation: "successPop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) both" }}
      >
        <svg className="w-8 h-8 text-primary-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
        </svg>
      </div>

      <h3
        className="text-xl font-bold text-gray-900 mb-2"
        style={{ animation: "fadeUp 0.3s ease-out 0.2s both" }}
      >
        We&apos;re here to help
      </h3>
      <p
        className="text-gray-500 text-[15px] mb-6 max-w-xs mx-auto"
        style={{ animation: "fadeUp 0.3s ease-out 0.3s both" }}
      >
        Our team can verify <span className="font-medium text-gray-700">{businessName}</span> manually.
      </p>

      {/* Contact options */}
      <div
        className="space-y-2.5 mb-6 max-w-xs mx-auto"
        style={{ animation: "fadeUp 0.3s ease-out 0.4s both" }}
      >
        <a
          href="mailto:support@olera.care?subject=Verification%20Help"
          className="flex items-center justify-center gap-2.5 w-full py-3 px-4 bg-gray-900 hover:bg-gray-800 text-white font-semibold rounded-xl transition-all"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
          </svg>
          Email support
        </a>
        <a
          href="tel:+19792439801"
          className="flex items-center justify-center gap-2.5 w-full py-3 px-4 bg-white hover:bg-gray-50 text-gray-700 font-semibold rounded-xl border border-gray-200 transition-all"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
          </svg>
          Call (979) 243-9801
        </a>
      </div>

      <button
        onClick={onClose}
        className="text-gray-400 hover:text-gray-600 font-medium transition-colors text-sm"
        style={{ animation: "fadeUp 0.3s ease-out 0.5s both" }}
      >
        Close
      </button>

      <style jsx>{`
        @keyframes successPop {
          0% { opacity: 0; transform: scale(0.5); }
          70% { transform: scale(1.1); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ============================================================
// Shared Components
// ============================================================

function FormWrapper({
  children,
  onSubmit,
  isValid,
  submitting,
}: {
  children: React.ReactNode;
  onSubmit: () => void;
  isValid: boolean;
  submitting: boolean;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (isValid && !submitting) onSubmit();
      }}
      className="py-2 space-y-5"
    >
      {children}
    </form>
  );
}

function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function ErrorBanner({
  message,
  onTryAnother,
  showTryAnother,
}: {
  message: string;
  onTryAnother: () => void;
  showTryAnother: boolean;
}) {
  return (
    <div className="px-4 py-3 bg-amber-50 border border-amber-100 rounded-xl">
      <p className="text-sm text-amber-700 font-medium">{message}</p>
      {showTryAnother && (
        <button
          type="button"
          onClick={onTryAnother}
          className="mt-2 text-sm font-medium text-amber-600 hover:text-amber-700 underline underline-offset-2"
        >
          Try a different method
        </button>
      )}
    </div>
  );
}

function SubmitButton({
  submitting,
  disabled,
}: {
  submitting: boolean;
  disabled: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={disabled || submitting}
      className="w-full py-4 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
    >
      {submitting ? (
        <>
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Verifying...
        </>
      ) : (
        "Continue"
      )}
    </button>
  );
}

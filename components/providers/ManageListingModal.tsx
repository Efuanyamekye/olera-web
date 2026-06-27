"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import { useAuth } from "@/components/auth/AuthProvider";
import type { ClaimState } from "@/lib/types";

// ============================================================
// Utility Functions
// ============================================================

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***@***.com";
  const maskedLocal =
    local.length <= 2
      ? "*".repeat(local.length)
      : local[0] + "***" + local[local.length - 1];
  return `${maskedLocal}@${domain}`;
}

// ============================================================
// Info Tooltip Component
// ============================================================

function InfoTooltip({ content }: { content: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  return (
    <div className="relative inline-flex" ref={tooltipRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="p-1 -m-0.5 text-gray-400 hover:text-gray-600 transition-colors rounded-full hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
        aria-label="More information"
        aria-expanded={isOpen}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-full mt-2 z-[200] w-[calc(100vw-3rem)] max-w-72 p-3.5 bg-gray-900 text-white text-sm rounded-xl shadow-xl animate-fade-in"
          role="tooltip"
        >
          {/* Arrow */}
          <div className="absolute -top-1.5 right-3 w-3 h-3 bg-gray-900 rotate-45" />
          <p className="relative text-[13px] leading-relaxed text-gray-100">
            {content}
          </p>
        </div>
      )}
    </div>
  );
}

type ModalView = "choice" | "removal";

const ACTION_OPTIONS = [
  { value: "hide", label: "Hide page" },
  { value: "delete", label: "Delete page" },
];

const REASON_OPTIONS = [
  { value: "i_own_this_business", label: "I own this business" },
  { value: "business_permanently_closed", label: "Business is permanently closed" },
  { value: "duplicate_listing", label: "Duplicate listing" },
  { value: "information_is_inaccurate", label: "Information is inaccurate" },
  { value: "privacy_concern", label: "Privacy concern" },
  { value: "other", label: "Other" },
];


interface ManageListingModalProps {
  isOpen: boolean;
  onClose: () => void;
  providerName: string;
  providerSlug: string;
  providerId: string;
  /** The olera-providers.provider_id (needed for claim verification). Falls back to providerId. */
  sourceProviderId?: string | null;
  /** The provider's current claim state */
  claimState?: ClaimState;
  /** The account_id of the claiming user (for ownership check) */
  claimAccountId?: string | null;
  /** The provider's email on file (for claim nudge) */
  providerEmail?: string | null;
  /** Provider's city */
  providerCity?: string | null;
  /** Provider's state */
  providerState?: string | null;
}

/** Trigger button + modal combo for use in server components */
export function ManagePageButton({
  providerName,
  providerSlug,
  providerId,
  sourceProviderId,
  claimState,
  claimAccountId,
  providerEmail,
  providerCity,
  providerState,
}: Omit<ManageListingModalProps, "isOpen" | "onClose">) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-5 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors flex-shrink-0"
      >
        Manage this page
      </button>
      <ManageListingModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        providerName={providerName}
        providerSlug={providerSlug}
        providerId={providerId}
        sourceProviderId={sourceProviderId}
        claimState={claimState}
        claimAccountId={claimAccountId}
        providerEmail={providerEmail}
        providerCity={providerCity}
        providerState={providerState}
      />
    </>
  );
}

export default function ManageListingModal({
  isOpen,
  onClose,
  providerName,
  providerSlug,
  providerId,
  sourceProviderId,
  claimState,
  claimAccountId,
  providerEmail,
  providerCity,
  providerState,
}: ManageListingModalProps) {
  const router = useRouter();
  const { account } = useAuth();
  const [view, setView] = useState<ModalView>("choice");
  const [isMobile, setIsMobile] = useState(false);

  // Removal form state
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [action, setAction] = useState("");
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const canSubmit = !!fullName.trim() && !!email.trim() && !!phone.trim() && !!action && !!reason;

  // Ownership detection
  const isClaimed = claimState === "claimed";
  const isOwner = isClaimed && !!account && !!claimAccountId && account.id === claimAccountId;

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Scroll modal body to top when view changes
  const viewContentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scrollable = viewContentRef.current?.closest(".overflow-y-auto");
    if (scrollable) scrollable.scrollTop = 0;
  }, [view]);

  function handleClose() {
    onClose();
    setTimeout(() => {
      setView("choice");
      // Reset removal form
      setFullName("");
      setEmail("");
      setPhone("");
      setAction("");
      setReason("");
      setDetails("");
      setFormError(null);
      setSubmitted(false);
    }, 200);
  }

  // Claim flow: Route to unified onboarding page with org pre-selected
  // User already knows which org they're claiming, so pre-fill it
  function handleClaimClick() {
    onClose();
    router.push(`/provider/onboarding?org=${providerSlug}`);
  }

  // Show removal form in modal (desktop) or navigate to page (mobile)
  function handleRemovalClick() {
    if (isMobile) {
      // Navigate to dedicated page on mobile
      const params = new URLSearchParams({
        provider_name: providerName,
        provider_id: sourceProviderId || providerId,
      });
      router.push(`/for-providers/removal-request/${providerSlug}?${params.toString()}`);
    } else {
      // Show inline form on desktop
      setView("removal");
    }
  }

  async function handleRemovalSubmit() {
    if (!canSubmit) {
      setFormError("Please fill in all required fields.");
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const res = await fetch("/api/removal-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_id: sourceProviderId || providerId,
          provider_name: providerName,
          provider_slug: providerSlug,
          full_name: fullName.trim(),
          business_email: email.trim(),
          business_phone: phone.trim(),
          action,
          reason,
          additional_details: details.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to submit request");
      }

      setSubmitted(true);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const modalTitle = view === "removal" ? "Request removal" : "Manage listing";

  // Sticky footer for removal view
  const modalFooter = view === "removal" && !submitted ? (
    <div className="pt-4 border-t border-gray-100">
      <Button
        fullWidth
        size="lg"
        onClick={handleRemovalSubmit}
        loading={submitting}
        disabled={!canSubmit}
      >
        Submit request
      </Button>
      <p className="text-xs text-gray-400 text-center mt-3">
        By submitting, you agree to our{" "}
        <span className="text-primary-600 font-medium hover:underline cursor-pointer">Takedown Policy</span>.
      </p>
    </div>
  ) : undefined;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={modalTitle}
      size="2xl"
      footer={modalFooter}
    >
      <div ref={viewContentRef}>
      {/* ── Choice Screen ── */}
      {view === "choice" && (
        <div className="pt-2 pb-4">
          {/* CASE 1: Claimed + Owner → Go to Dashboard */}
          {isOwner && (
            <div className="rounded-2xl border border-primary-100 bg-primary-50/60 p-5">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path fillRule="evenodd" d="M12.516 2.17a.75.75 0 00-1.032 0 11.209 11.209 0 01-7.877 3.08.75.75 0 00-.722.515A12.74 12.74 0 002.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 00.374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 00-.722-.516l-.143.001c-2.996 0-5.717-1.17-7.734-3.08zm3.094 8.016a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-primary-900 mb-0.5">
                    You manage this listing
                  </h3>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    This listing is linked to your account. Update info, respond to families, and manage your presence.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => router.push("/provider")}
                className="w-full py-3 bg-primary-700 hover:bg-primary-800 active:bg-primary-900 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
              >
                Go to Dashboard
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}

          {/* CASE 2: Unclaimed OR Claimed (not owner) → Claim card (routes to onboarding) */}
          {!isOwner && (
            <div className="rounded-2xl border border-primary-100 bg-primary-50/60 p-6">
              {/* Centered header */}
              <div className="text-center mb-5">
                {/* Icon */}
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-600 to-primary-700 flex items-center justify-center mx-auto mb-4 shadow-sm">
                  <svg
                    className="w-6 h-6 text-white"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M12.516 2.17a.75.75 0 00-1.032 0 11.209 11.209 0 01-7.877 3.08.75.75 0 00-.722.515A12.74 12.74 0 002.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 00.374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 00-.722-.516l-.143.001c-2.996 0-5.717-1.17-7.734-3.08zm3.094 8.016a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                {/* Title with tooltip */}
                <h3 className="text-lg font-display font-bold text-gray-900 mb-1.5 inline-flex items-center gap-1.5">
                  Manage this page
                  <InfoTooltip content="Sign in with your business email. If it matches our records, you'll get instant access to manage this listing." />
                </h3>
                {/* Conditional subtitle */}
                <p className="text-[15px] text-gray-600 leading-relaxed mb-4">
                  {providerEmail
                    ? <>Sign in with <span className="font-semibold text-gray-700">{maskEmail(providerEmail)}</span> for instant access.</>
                    : "Use your business email for instant verification."}
                </p>
              </div>
              {/* CTA button - routes to onboard page */}
              <button
                type="button"
                onClick={handleClaimClick}
                className="w-full py-3.5 bg-primary-700 hover:bg-primary-800 active:bg-primary-900 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 min-h-[48px]"
              >
                Get started
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}

          {/* Separator + removal link */}
          <div className="mt-5 pt-5 border-t border-gray-100">
            <button
              type="button"
              onClick={handleRemovalClick}
              className="w-full text-center text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              Request to hide or remove this page
            </button>
          </div>
        </div>
      )}

      {/* ── Removal Request View (Desktop only) ── */}
      {view === "removal" && (
        <div className="pt-2 pb-4">
          {/* Success state */}
          {submitted ? (
            <div className="text-center py-8 animate-wizard-in">
              <div className="relative inline-block mb-6">
                <div className="w-16 h-16 bg-primary-50 rounded-2xl flex items-center justify-center shadow-sm">
                  <svg className="w-8 h-8 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-primary-600 rounded-full flex items-center justify-center ring-2 ring-white">
                  <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>

              <h2 className="text-xl font-bold text-gray-900 mb-1">Thank you!</h2>
              <p className="text-base font-medium text-gray-800 mb-3">Your request has been received</p>
              <p className="text-gray-500 text-sm max-w-sm mx-auto leading-relaxed mb-6">
                Our team will verify your ownership and contact you within 2 to 3 business days to confirm removal.
              </p>

              <Button onClick={handleClose} size="md">
                Done
              </Button>
            </div>
          ) : (
            <>
              {/* Back button */}
              <button
                type="button"
                onClick={() => setView("choice")}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-500 hover:text-gray-700 transition-colors mb-5 -ml-0.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>

              {/* Header with context */}
              <div className="mb-6">
                <h2 className="text-lg font-display font-bold text-gray-900 tracking-tight">
                  Request to hide or remove page
                </h2>
                <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
                  Please provide your contact details so we can verify your request and follow up.
                </p>
              </div>

              <div className="space-y-4">
                {/* Full name */}
                <div className="space-y-1.5">
                  <label htmlFor="modal-removal-name" className="block text-[13px] font-semibold text-gray-700">
                    Full name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="modal-removal-name"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your full name"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50/50 text-[15px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent focus:ring-primary-300 focus:bg-white transition-all min-h-[48px]"
                  />
                </div>

                {/* Email */}
                <div className="space-y-1.5">
                  <label htmlFor="modal-removal-email" className="block text-[13px] font-semibold text-gray-700">
                    Business email <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="modal-removal-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50/50 text-[15px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent focus:ring-primary-300 focus:bg-white transition-all min-h-[48px]"
                  />
                </div>

                {/* Phone */}
                <div className="space-y-1.5">
                  <label htmlFor="modal-removal-phone" className="block text-[13px] font-semibold text-gray-700">
                    Business phone <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="modal-removal-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50/50 text-[15px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent focus:ring-primary-300 focus:bg-white transition-all min-h-[48px]"
                  />
                </div>

                {/* Two-column layout for action + reason */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Hide or delete */}
                  <Select
                    label="Action"
                    required
                    options={ACTION_OPTIONS}
                    value={action}
                    onChange={setAction}
                    placeholder="Select action"
                  />

                  {/* Reason */}
                  <Select
                    label="Reason"
                    required
                    options={REASON_OPTIONS}
                    value={reason}
                    onChange={setReason}
                    placeholder="Select reason"
                  />
                </div>

                {/* Additional details */}
                <div className="space-y-1.5">
                  <label htmlFor="modal-removal-details" className="block text-[13px] font-semibold text-gray-700">
                    Additional details <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <textarea
                    id="modal-removal-details"
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    placeholder="Any context to help us process your request..."
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50/50 text-[15px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent focus:ring-primary-300 focus:bg-white resize-none transition-all"
                  />
                </div>

                {formError && (
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-100 rounded-lg">
                    <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                    </svg>
                    <p className="text-sm text-red-700" role="alert">{formError}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      </div>
    </Modal>
  );
}

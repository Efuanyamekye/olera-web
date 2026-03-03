"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { useAuth } from "@/components/auth/AuthProvider";
import type { ClaimState } from "@/lib/types";

type ModalView = "choice" | "removal-form" | "removal-confirmation";

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
}

/** Trigger button + modal combo for use in server components */
export function ManagePageButton({
  providerName,
  providerSlug,
  providerId,
  sourceProviderId,
  claimState,
  claimAccountId,
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
}: ManageListingModalProps) {
  const router = useRouter();
  const { account } = useAuth();
  const [view, setView] = useState<ModalView>("choice");

  // Ownership detection
  const isClaimed = claimState === "claimed";
  const isOwner = isClaimed && !!account && !!claimAccountId && account.id === claimAccountId;

  // Scroll modal body to top when view changes
  const viewContentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scrollable = viewContentRef.current?.closest(".overflow-y-auto");
    if (scrollable) scrollable.scrollTop = 0;
  }, [view]);

  // Removal form state
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [action, setAction] = useState("");
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function handleClose() {
    onClose();
    // Reset after close animation completes
    setTimeout(() => {
      setView("choice");
      setFullName("");
      setEmail("");
      setPhone("");
      setAction("");
      setReason("");
      setDetails("");
      setFormError(null);
    }, 200);
  }

  function handleClaimClick() {
    // Navigate to the claim verification page — no auth modal
    const claimId = sourceProviderId || providerId;
    handleClose();
    router.push(`/for-providers/claim/${providerSlug}?provider_id=${claimId}`);
  }

  function handleDisputeClick() {
    const claimId = sourceProviderId || providerId;
    handleClose();
    router.push(`/for-providers/claim/${providerSlug}?provider_id=${claimId}`);
  }

  async function handleSubmitRemoval() {
    if (!fullName.trim() || !email.trim() || !phone.trim() || !action || !reason) {
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
          provider_id: providerId,
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

      setView("removal-confirmation");
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  // Dynamic modal config per view
  const title =
    view === "choice" ? "Manage this listing" : "Request to hide or remove page";

  const modalOnBack =
    view === "removal-form"
      ? () => {
          setView("choice");
          setFormError(null);
        }
      : undefined;

  const footer =
    view === "removal-form" ? (
      <div className="border-t border-gray-100 pt-5 mt-2">
        <Button fullWidth size="lg" onClick={handleSubmitRemoval} loading={submitting}>
          Submit request
        </Button>
        <p className="text-sm text-gray-500 text-center mt-3">
          By submitting this form, you agree to our{" "}
          <span className="text-primary-600 font-medium cursor-pointer hover:text-primary-700 underline-offset-2 hover:underline transition-colors">
            Takedown Request Policy
          </span>
          .
        </p>
      </div>
    ) : undefined;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      size="2xl"
      onBack={modalOnBack}
      footer={footer}
    >
      <div ref={viewContentRef}>
      {/* ── Choice Screen ── */}
      {view === "choice" && (
        <div className="pt-2 pb-4">
          {/* CASE 1: Claimed + Owner → Go to Dashboard */}
          {isOwner && (
            <>
              <div className="w-full text-left rounded-2xl shadow-md border border-primary-100 bg-gradient-to-br from-primary-50/30 to-white p-7">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center shrink-0">
                    <svg className="w-6 h-6 text-primary-600" viewBox="0 0 24 24" fill="currentColor">
                      <path fillRule="evenodd" d="M12.516 2.17a.75.75 0 00-1.032 0 11.209 11.209 0 01-7.877 3.08.75.75 0 00-.722.515A12.74 12.74 0 002.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 00.374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 00-.722-.516l-.143.001c-2.996 0-5.717-1.17-7.734-3.08zm3.094 8.016a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 tracking-tight mb-1">
                      You manage this listing
                    </h3>
                    <p className="text-gray-600 text-base leading-relaxed mb-4">
                      This listing is linked to your account. Visit your dashboard to update information, respond to families, and manage your presence.
                    </p>
                    <Button onClick={() => { handleClose(); router.push("/provider"); }}>
                      Go to Dashboard
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* CASE 2: Claimed + NOT Owner → Info + Dispute */}
          {isClaimed && !isOwner && (
            <>
              <div className="rounded-2xl shadow-md border border-amber-100 bg-amber-50/30 p-7">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
                    <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 tracking-tight mb-1">
                      This listing has been claimed
                    </h3>
                    <p className="text-gray-600 text-base leading-relaxed mb-4">
                      Someone has already verified ownership of <strong>{providerName}</strong>. If you believe this is incorrect, you can dispute the claim.
                    </p>
                    <button
                      type="button"
                      onClick={handleDisputeClick}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600 hover:text-primary-700 transition-colors"
                    >
                      Dispute this claim
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* CASE 3: Unclaimed → Claim card */}
          {!isClaimed && (
            <button
              type="button"
              onClick={handleClaimClick}
              className="w-full text-left rounded-2xl shadow-sm border border-gray-100 bg-gradient-to-br from-primary-50/30 to-white p-7 hover:shadow-lg hover:border-primary-200 transition-all duration-200 group"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-primary-200 transition-colors">
                  <svg
                    className="w-6 h-6 text-primary-600"
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
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 tracking-tight mb-1">
                    Claim this listing
                  </h3>
                  <p className="text-gray-600 text-base leading-relaxed mb-4">
                    Take control of your page to update information, respond to
                    families, and manage your online presence.
                  </p>
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600 group-hover:text-primary-700 transition-colors">
                    Get started
                    <svg
                      className="w-4 h-4 group-hover:translate-x-0.5 transition-transform"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </span>
                </div>
              </div>
            </button>
          )}

          {/* Separator + removal link — secondary action (always visible) */}
          <div className="mt-8 pt-6 border-t border-gray-100">
            <p className="text-sm text-gray-500 mb-1">
              Need to request a change instead?
            </p>
            <button
              type="button"
              onClick={() => setView("removal-form")}
              className="inline-flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-primary-600 transition-colors"
            >
              Request to hide or remove this page
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ── Removal Form ── */}
      {view === "removal-form" && (
        <div className="space-y-6 pt-2 animate-step-in">
          {/* Full name */}
          <div className="space-y-2">
            <label
              htmlFor="removal-full-name"
              className="block text-base font-medium text-gray-700"
            >
              Full name <span className="text-red-500">*</span>
            </label>
            <input
              id="removal-full-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
              className="w-full px-4 py-3 rounded-xl border border-gray-300 text-base placeholder:text-gray-400 transition-colors duration-200 focus:outline-none focus:ring-2 focus:border-transparent focus:ring-primary-500 min-h-[44px]"
            />
          </div>

          {/* Email + Phone row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label
                htmlFor="removal-email"
                className="block text-base font-medium text-gray-700"
              >
                Business email <span className="text-red-500">*</span>
              </label>
              <input
                id="removal-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@gmail.com"
                className="w-full px-4 py-3 rounded-xl border border-gray-300 text-base placeholder:text-gray-400 transition-colors duration-200 focus:outline-none focus:ring-2 focus:border-transparent focus:ring-primary-500 min-h-[44px]"
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="removal-phone"
                className="block text-base font-medium text-gray-700"
              >
                Business phone number <span className="text-red-500">*</span>
              </label>
              <input
                id="removal-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 123-4567"
                className="w-full px-4 py-3 rounded-xl border border-gray-300 text-base placeholder:text-gray-400 transition-colors duration-200 focus:outline-none focus:ring-2 focus:border-transparent focus:ring-primary-500 min-h-[44px]"
              />
            </div>
          </div>

          {/* Action + Reason row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label
                htmlFor="removal-action"
                className="block text-base font-medium text-gray-700"
              >
                Hide or delete page <span className="text-red-500">*</span>
              </label>
              <select
                id="removal-action"
                value={action}
                onChange={(e) => setAction(e.target.value)}
                className={`w-full pl-4 pr-10 py-3 rounded-xl border border-gray-300 text-base transition-colors duration-200 focus:outline-none focus:ring-2 focus:border-transparent focus:ring-primary-500 min-h-[44px] bg-white ${
                  !action ? "text-gray-400" : "text-gray-900"
                }`}
              >
                <option value="" disabled>
                  Select
                </option>
                {ACTION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label
                htmlFor="removal-reason"
                className="block text-base font-medium text-gray-700"
              >
                Reason <span className="text-red-500">*</span>
              </label>
              <select
                id="removal-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className={`w-full pl-4 pr-10 py-3 rounded-xl border border-gray-300 text-base transition-colors duration-200 focus:outline-none focus:ring-2 focus:border-transparent focus:ring-primary-500 min-h-[44px] bg-white ${
                  !reason ? "text-gray-400" : "text-gray-900"
                }`}
              >
                <option value="" disabled>
                  Select
                </option>
                {REASON_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Additional details */}
          <div className="space-y-2">
            <label
              htmlFor="removal-details"
              className="block text-base font-medium text-gray-700"
            >
              Additional details
            </label>
            <textarea
              id="removal-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Any additional context to help us process your request..."
              rows={4}
              className="w-full px-4 py-3 rounded-xl border border-gray-300 text-base placeholder:text-gray-400 transition-colors duration-200 focus:outline-none focus:ring-2 focus:border-transparent focus:ring-primary-500 resize-none"
            />
          </div>

          {/* Error */}
          {formError && (
            <p className="text-sm text-red-600" role="alert">
              {formError}
            </p>
          )}
        </div>
      )}

      {/* ── Confirmation ── */}
      {view === "removal-confirmation" && (
        <div className="flex flex-col items-center justify-center py-12 text-center animate-wizard-in">
          {/* Envelope with checkmark */}
          <div className="relative mb-6">
            <div className="w-16 h-16 bg-primary-50 rounded-2xl flex items-center justify-center shadow-sm">
              <svg
                className="w-8 h-8 text-primary-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                />
              </svg>
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-primary-600 rounded-full flex items-center justify-center ring-2 ring-white animate-success-pop">
              <svg
                className="w-3.5 h-3.5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
          </div>

          <h3 className="text-xl font-bold text-gray-900 mb-1">Thank you!</h3>
          <p className="text-lg font-medium text-gray-800 mb-3">
            Your request has been received
          </p>
          <p className="text-gray-500 text-base max-w-sm leading-relaxed mb-8">
            Our team will verify your ownership and contact you within 2 to 3
            business days to confirm removal.
          </p>

          <Button onClick={handleClose} size="md">
            Done!
          </Button>
        </div>
      )}
      </div>
    </Modal>
  );
}

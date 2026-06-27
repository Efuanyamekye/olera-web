"use client";

import { useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";

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

export default function RemovalRequestPage() {
  const { slug } = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const providerName = searchParams.get("provider_name") || "this provider";
  const providerId = searchParams.get("provider_id") || slug;

  // Form state
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

  async function handleSubmit() {
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
          provider_id: providerId,
          provider_name: providerName,
          provider_slug: slug,
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

  // ── Confirmation screen ──
  if (submitted) {
    return (
      <>
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
          <div className="max-w-lg mx-auto px-4 sm:px-6 h-14 flex items-center">
            <Link
              href={`/provider/${slug}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to listing
            </Link>
          </div>
        </div>

        <div className="max-w-lg mx-auto px-4 sm:px-6 py-16 text-center animate-wizard-in">
          <div className="relative inline-block mb-6">
            <div className="w-16 h-16 bg-primary-50 rounded-2xl flex items-center justify-center shadow-sm">
              <svg className="w-8 h-8 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-primary-600 rounded-full flex items-center justify-center ring-2 ring-white animate-success-pop">
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-1">Thank you!</h1>
          <p className="text-lg font-medium text-gray-800 mb-3">Your request has been received</p>
          <p className="text-gray-500 text-base max-w-sm mx-auto leading-relaxed mb-8">
            Our team will verify your ownership and contact you within 2 to 3 business days to confirm removal.
          </p>

          <Button onClick={() => window.history.back()} size="md">
            Done
          </Button>
        </div>
      </>
    );
  }

  // ── Form screen ──
  return (
    <div className="min-h-[100dvh] bg-white">
      {/* Form content */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 pb-40">
        {/* Back link + Title */}
        <div className="mb-5">
          <Link
            href={`/provider/${slug}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors mb-3"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to listing
          </Link>
          <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight">
            Request to hide or remove page
          </h1>
          <p className="text-sm text-gray-500 mt-1.5">
            Please provide your contact details so we can verify your request.
          </p>
        </div>

        <div className="space-y-5">
          {/* Full name - full width */}
          <div className="space-y-1.5">
            <label htmlFor="removal-full-name" className="block text-[13px] font-semibold text-gray-700">
              Full name <span className="text-red-500">*</span>
            </label>
            <input
              id="removal-full-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50/50 text-base placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent focus:ring-primary-300 focus:bg-white transition-all min-h-[48px]"
            />
          </div>

          {/* Email + Phone - side by side on desktop */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="removal-email" className="block text-[13px] font-semibold text-gray-700">
                Business email <span className="text-red-500">*</span>
              </label>
              <input
                id="removal-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50/50 text-base placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent focus:ring-primary-300 focus:bg-white transition-all min-h-[48px]"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="removal-phone" className="block text-[13px] font-semibold text-gray-700">
                Business phone <span className="text-red-500">*</span>
              </label>
              <input
                id="removal-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 123-4567"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50/50 text-base placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent focus:ring-primary-300 focus:bg-white transition-all min-h-[48px]"
              />
            </div>
          </div>

          {/* Action + Reason - side by side on desktop */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Action"
              required
              options={ACTION_OPTIONS}
              value={action}
              onChange={setAction}
              placeholder="Select action"
            />
            <Select
              label="Reason"
              required
              options={REASON_OPTIONS}
              value={reason}
              onChange={setReason}
              placeholder="Select reason"
            />
          </div>

          {/* Additional details - full width */}
          <div className="space-y-1.5">
            <label htmlFor="removal-details" className="block text-[13px] font-semibold text-gray-700">
              Additional details <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              id="removal-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Any context to help us process your request..."
              rows={3}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50/50 text-base placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent focus:ring-primary-300 focus:bg-white resize-none transition-all"
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
      </div>

      {/* Sticky footer with submit button */}
      <div
        className="fixed bottom-0 left-0 right-0 z-20 border-t border-gray-100 bg-white"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)" }}
      >
        <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-4">
          <Button
            fullWidth
            size="lg"
            onClick={handleSubmit}
            loading={submitting}
            disabled={!canSubmit}
          >
            Submit request
          </Button>
          <p className="text-xs text-gray-400 text-center mt-3">
            By submitting, you agree to our{" "}
            <span className="text-primary-600 font-medium">Takedown Policy</span>.
          </p>
        </div>
      </div>
    </div>
  );
}

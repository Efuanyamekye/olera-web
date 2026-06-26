"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import ModalFooter from "./ModalFooter";
import { saveProfile } from "./save-profile";
import { trackProfileEdit } from "@/lib/analytics/track-profile-edit";
import type { BaseEditModalProps } from "./types";
import { getPricingConfig } from "@/lib/pricing-config";

const COMMON_SERVICES = [
  "Private Room",
  "Semi-Private Room",
  "Studio",
  "1 Bedroom",
  "2 Bedroom",
  "Memory Care",
  "Skilled Nursing",
  "Respite Care",
  "Adult Day Care",
  "Home Care",
  "Companion Care",
  "Personal Care",
];

const RATE_TYPES = [
  { value: "per month", label: "Monthly" },
  { value: "per day", label: "Daily" },
  { value: "per hour", label: "Hourly" },
  { value: "per visit", label: "Per visit" },
  { value: "flat rate", label: "Flat rate" },
];

const FREQUENCY_SUFFIX: Record<string, string> = {
  "per month": "/mo",
  "per day": "/day",
  "per hour": "/hr",
  "per visit": "/visit",
  "flat rate": "",
};

interface PricingRow {
  service: string;
  rateMin: string;
  rateMax: string;
  rateType: string;
}

/** Parse a number string like "3,500" or "3500" to a number */
function parsePrice(str: string): number | undefined {
  if (!str) return undefined;
  const num = parseInt(str.replace(/,/g, ""), 10);
  return isNaN(num) ? undefined : num;
}

/** Format number for display with commas */
function formatNumber(num: number | undefined): string {
  if (num === undefined) return "";
  return num.toLocaleString("en-US");
}

/** Build the price_range display string from min/max/frequency */
function buildPriceRangeString(
  lower: number | undefined,
  upper: number | undefined,
  frequency: string
): string {
  // Use hasOwnProperty check to handle empty string for flat rate
  const suffix = frequency in FREQUENCY_SUFFIX ? FREQUENCY_SUFFIX[frequency] : "/mo";
  if (lower && upper && upper > lower) {
    return `$${lower.toLocaleString()} - $${upper.toLocaleString()}${suffix}`;
  }
  if (lower) {
    return `From $${lower.toLocaleString()}${suffix}`;
  }
  return "";
}

function formatRateDisplay(rateMin: string, rateMax: string, rateType: string): string {
  if (!rateMin && !rateMax) return "";
  const suffix = FREQUENCY_SUFFIX[rateType] || "/mo";
  if (rateMin && rateMax && rateMax !== rateMin) {
    return `$${rateMin} - $${rateMax}${suffix}`;
  }
  if (rateMin) {
    return `$${rateMin}${suffix}`;
  }
  return "";
}

export default function EditPricingModal({
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
  // Initialize from metadata
  const [contactForPricing, setContactForPricing] = useState(
    metadata.contact_for_pricing || false
  );
  const [lowerPrice, setLowerPrice] = useState(
    formatNumber(metadata.lower_price)
  );
  const [upperPrice, setUpperPrice] = useState(
    formatNumber(metadata.upper_price)
  );
  const [priceFrequency, setPriceFrequency] = useState(
    metadata.price_frequency || "per month"
  );
  const [rows, setRows] = useState<PricingRow[]>(
    metadata.pricing_details && metadata.pricing_details.length > 0
      ? metadata.pricing_details.map((d) => {
          // Handle legacy single rate format - parse "rateMin" and "rateMax" if present, otherwise use "rate"
          const legacyRate = (d.rate || "").replace(/^\$/, "");
          return {
            service: d.service,
            rateMin: (d as { rateMin?: string }).rateMin?.replace(/^\$/, "") || legacyRate,
            rateMax: (d as { rateMax?: string }).rateMax?.replace(/^\$/, "") || "",
            rateType: d.rateType,
          };
        })
      : []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add service inline form state
  const [isAddingService, setIsAddingService] = useState(false);
  const [newService, setNewService] = useState("");
  const [newRateMin, setNewRateMin] = useState("");
  const [newRateMax, setNewRateMax] = useState("");
  const [newRateType, setNewRateType] = useState("per month");

  // Track if user has interacted with the form
  const [hasInteracted, setHasInteracted] = useState(false);

  // Compute current values for comparison
  const currentLower = parsePrice(lowerPrice);
  const currentUpper = parsePrice(upperPrice);
  const originalRows =
    metadata.pricing_details && metadata.pricing_details.length > 0
      ? metadata.pricing_details
      : [];

  // Normalize rows for comparison (add $ prefix like we do on save)
  const normalizedRows = rows.map((r) => ({
    ...r,
    rateMin: r.rateMin ? `$${r.rateMin.replace(/^\$/, "")}` : "",
    rateMax: r.rateMax ? `$${r.rateMax.replace(/^\$/, "")}` : "",
  }));

  const hasChanges =
    hasInteracted &&
    (contactForPricing !== (metadata.contact_for_pricing || false) ||
      currentLower !== metadata.lower_price ||
      currentUpper !== metadata.upper_price ||
      priceFrequency !== (metadata.price_frequency || "per month") ||
      JSON.stringify(normalizedRows) !== JSON.stringify(originalRows));

  const selectedServices = rows.map((r) => r.service);
  const availableServices = COMMON_SERVICES.filter(
    (s) => !selectedServices.includes(s)
  );

  function removeRow(service: string) {
    setRows((prev) => prev.filter((r) => r.service !== service));
    setHasInteracted(true);
  }

  function handleAddService() {
    if (!newService.trim()) return;
    setRows((prev) => [
      ...prev,
      { service: newService, rateMin: newRateMin, rateMax: newRateMax, rateType: newRateType },
    ]);
    setNewService("");
    setNewRateMin("");
    setNewRateMax("");
    setNewRateType("per month");
    setIsAddingService(false);
    setHasInteracted(true);
  }

  function handleCancelAdd() {
    setNewService("");
    setNewRateMin("");
    setNewRateMax("");
    setNewRateType("per month");
    setIsAddingService(false);
  }

  async function handleSave() {
    if (!hasChanges && !guidedMode) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const validRows = rows
        .filter((r) => r.service.trim())
        .map((r) => ({
          service: r.service,
          rateMin: r.rateMin ? `$${r.rateMin.replace(/^\$/, "")}` : "",
          rateMax: r.rateMax ? `$${r.rateMax.replace(/^\$/, "")}` : "",
          rateType: r.rateType,
          // Keep legacy "rate" field for backwards compatibility
          rate: r.rateMin ? `$${r.rateMin.replace(/^\$/, "")}` : "",
        }));

      // Build the display string for backwards compatibility
      const priceRangeString = contactForPricing
        ? ""
        : buildPriceRangeString(currentLower, currentUpper, priceFrequency);

      await saveProfile({
        profileId: profile.id,
        metadataFields: {
          contact_for_pricing: contactForPricing,
          lower_price: contactForPricing ? undefined : currentLower,
          upper_price: contactForPricing ? undefined : currentUpper,
          price_frequency: contactForPricing ? undefined : priceFrequency,
          price_range: priceRangeString || undefined,
          pricing_details: validRows.length > 0 ? validRows : undefined,
        },
        existingMetadata: (profile.metadata || {}) as Record<string, unknown>,
      });
      if (hasChanges) trackProfileEdit(profile.slug, "pricing");
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
      title="Pricing"
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
      <div className="space-y-6 pt-1">
        {/* Section 1 — Display toggle */}
        <div>
          <label className="block text-[13px] font-semibold text-gray-900 uppercase tracking-wide mb-3">
            Pricing display
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setContactForPricing(false);
                setHasInteracted(true);
              }}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                !contactForPricing
                  ? "bg-primary-50 ring-2 ring-primary-500 text-primary-700"
                  : "bg-gray-50 ring-1 ring-gray-200 text-gray-600 hover:ring-gray-300 hover:bg-gray-100"
              }`}
            >
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${!contactForPricing ? "bg-primary-100" : "bg-gray-200"}`}>
                <svg
                  className={`w-4 h-4 ${!contactForPricing ? "text-primary-600" : "text-gray-500"}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <span>Show my rates</span>
              {!contactForPricing && (
                <svg className="w-4 h-4 text-primary-600 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setContactForPricing(true);
                setHasInteracted(true);
              }}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                contactForPricing
                  ? "bg-primary-50 ring-2 ring-primary-500 text-primary-700"
                  : "bg-gray-50 ring-1 ring-gray-200 text-gray-600 hover:ring-gray-300 hover:bg-gray-100"
              }`}
            >
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${contactForPricing ? "bg-primary-100" : "bg-gray-200"}`}>
                <svg
                  className={`w-4 h-4 ${contactForPricing ? "text-primary-600" : "text-gray-500"}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
              <span>Contact for pricing</span>
              {contactForPricing && (
                <svg className="w-4 h-4 text-primary-600 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-[13px] text-gray-500 mt-3">
            {contactForPricing
              ? "Families will see ‘Contact for pricing.’ That’s fine if you can’t publish rates — though listings that show a starting price tend to get more inquiries, so we recommend it when you can."
              : "Families will see your starting rates — listings with prices tend to get more inquiries."}
          </p>

          {/* Category-specific pricing guidance */}
          {profile.category && (() => {
            const config = getPricingConfig(profile.category);
            // Generic (provider-facing) text — provider knows which facility is theirs.
            if (config.tier === 3 && config.coverageNote) {
              return (
                <div className="mt-3 px-3.5 py-2.5 bg-teal-50 rounded-lg border border-teal-100">
                  <p className="text-xs text-teal-800 leading-relaxed">
                    <span className="font-semibold">Note:</span> {config.coverageNote()}{" "}
                    Consider listing both private-pay rates and accepted coverage options.
                  </p>
                </div>
              );
            }
            if (config.tier === 2 && config.coverageNote) {
              return (
                <div className="mt-3 px-3.5 py-2.5 bg-blue-50 rounded-lg border border-blue-100">
                  <p className="text-xs text-blue-800 leading-relaxed">
                    <span className="font-semibold">Tip:</span> {config.coverageNote()}
                  </p>
                </div>
              );
            }
            return null;
          })()}
        </div>

        {/* Section 2 — Price range (hidden when "Contact for pricing") */}
        {!contactForPricing && (
          <div className="pt-6">
            <label className="block text-[13px] font-semibold text-gray-900 uppercase tracking-wide mb-3">
              Starting price
            </label>
            <div className="flex flex-wrap items-center gap-3">
              {/* Min price */}
              <div className="relative flex-1 min-w-[100px]">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">
                  $
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={lowerPrice}
                  onChange={(e) => {
                    setLowerPrice(e.target.value.replace(/[^\d,]/g, ""));
                    setHasInteracted(true);
                  }}
                  placeholder="Min"
                  aria-label="Minimum price"
                  className="w-full pl-8 pr-3 py-3 rounded-xl bg-gray-50 border-0 ring-1 ring-inset ring-gray-200 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow"
                />
              </div>

              <span className="text-gray-400 text-sm font-medium">to</span>

              {/* Max price */}
              <div className="relative flex-1 min-w-[100px]">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">
                  $
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={upperPrice}
                  onChange={(e) => {
                    setUpperPrice(e.target.value.replace(/[^\d,]/g, ""));
                    setHasInteracted(true);
                  }}
                  placeholder="Max"
                  aria-label="Maximum price"
                  className="w-full pl-8 pr-3 py-3 rounded-xl bg-gray-50 border-0 ring-1 ring-inset ring-gray-200 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow"
                />
              </div>

              {/* Frequency dropdown */}
              <div className="w-32 shrink-0">
                <Select
                  options={RATE_TYPES.map((t) => ({
                    value: t.value,
                    label: t.label,
                  }))}
                  value={priceFrequency}
                  onChange={(val) => {
                    setPriceFrequency(val);
                    setHasInteracted(true);
                  }}
                  size="sm"
                />
              </div>
            </div>
            {currentLower && (
              <p className="mt-3 text-sm text-gray-900">
                <span className="text-gray-500">Displays as:</span>{" "}
                <span className="font-semibold">{buildPriceRangeString(currentLower, currentUpper, priceFrequency)}</span>
              </p>
            )}
          </div>
        )}

        {/* Section 3 — Service rates (always visible) */}
        <div className="pt-6">
          <label className="block text-[13px] font-semibold text-gray-900 uppercase tracking-wide mb-3">
            Service rates
          </label>

          {/* Existing service rows */}
          {rows.length > 0 && (
            <div className="space-y-2 mb-4">
              {rows.map((row) => (
                <div
                  key={row.service}
                  className="group flex items-center gap-3 px-4 py-3 rounded-xl bg-white ring-1 ring-gray-200 hover:ring-gray-300 transition-all"
                >
                  <span className="text-sm font-medium text-gray-900 flex-1 min-w-0 truncate">
                    {row.service}
                  </span>
                  <span className="text-sm text-gray-500 font-medium shrink-0 tabular-nums">
                    {formatRateDisplay(row.rateMin, row.rateMax, row.rateType) || "No rate"}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeRow(row.service)}
                    className="w-7 h-7 -mr-1 rounded-lg flex items-center justify-center text-gray-400 opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-50 transition-all shrink-0"
                    aria-label={`Remove ${row.service}`}
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add service inline form */}
          {isAddingService ? (
            <div className="rounded-2xl bg-gray-50 ring-1 ring-gray-200 p-4 space-y-4">
              {/* Row 1: Service dropdown (full width) */}
              <Select
                options={availableServices.map((s) => ({ value: s, label: s }))}
                value={newService}
                onChange={setNewService}
                placeholder="Select service"
                size="sm"
              />

              {/* Row 2: Price range inputs + Frequency dropdown */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[80px]">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none z-10">
                    $
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={newRateMin}
                    onChange={(e) =>
                      setNewRateMin(e.target.value.replace(/[^\d,]/g, ""))
                    }
                    placeholder="Min"
                    aria-label="Minimum rate"
                    className="w-full pl-8 pr-3 py-2.5 rounded-xl bg-white ring-1 ring-inset ring-gray-200 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow"
                  />
                </div>
                <span className="text-gray-400 text-sm font-medium">to</span>
                <div className="relative flex-1 min-w-[80px]">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none z-10">
                    $
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={newRateMax}
                    onChange={(e) =>
                      setNewRateMax(e.target.value.replace(/[^\d,]/g, ""))
                    }
                    placeholder="Max"
                    aria-label="Maximum rate"
                    className="w-full pl-8 pr-3 py-2.5 rounded-xl bg-white ring-1 ring-inset ring-gray-200 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow"
                  />
                </div>
                <div className="w-28 shrink-0">
                  <Select
                    options={RATE_TYPES.map((t) => ({
                      value: t.value,
                      label: t.label,
                    }))}
                    value={newRateType}
                    onChange={setNewRateType}
                    size="sm"
                  />
                </div>
              </div>

              {/* Row 3: Action buttons */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCancelAdd}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddService}
                  disabled={!newService.trim()}
                  className="px-5 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl shadow-sm transition-colors"
                >
                  Add service
                </button>
              </div>
            </div>
          ) : (
            /* Add service button */
            <button
              type="button"
              onClick={() => setIsAddingService(true)}
              className="w-full py-3.5 px-4 rounded-xl bg-gray-50 ring-1 ring-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:ring-gray-300 transition-all flex items-center justify-center gap-2"
            >
              <span className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center">
                <svg
                  className="w-3 h-3 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </span>
              Add a service rate
            </button>
          )}
        </div>

        {error && (
          <div
            className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-100 p-3 mt-4"
            role="alert"
          >
            <svg
              className="w-4 h-4 text-red-400 shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
            <p className="text-sm text-red-600 flex-1">{error}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

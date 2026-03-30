"use client";

import { useState } from "react";
import { saveProfile } from "@/components/provider-dashboard/edit-modals/save-profile";
import type { BusinessProfile, FamilyMetadata } from "@/lib/types";

// ── Options ──

const RELATIONSHIP_OPTIONS = [
  { value: "myself", label: "Myself" },
  { value: "my_parent", label: "My parent" },
  { value: "my_spouse", label: "My spouse" },
  { value: "someone_else", label: "Someone else" },
];

const CARE_TYPE_OPTIONS = [
  "Assisted Living",
  "Home Care",
  "Home Health",
  "Memory Care",
  "Companion Care",
  "Hospice",
  "Skilled Nursing",
  "Respite Care",
  "Adult Day Care",
  "Rehabilitation",
  "Personal Care",
  "Independent Living",
];

const TIMELINE_OPTIONS = [
  { value: "immediate", label: "Immediately" },
  { value: "within_1_month", label: "Within a month" },
  { value: "within_3_months", label: "In a few months" },
  { value: "exploring", label: "Just exploring" },
];

const SCHEDULE_OPTIONS = [
  { value: "mornings", label: "Mornings" },
  { value: "afternoons", label: "Afternoons" },
  { value: "evenings", label: "Evenings" },
  { value: "overnight", label: "Overnight" },
  { value: "full_time", label: "Full-time" },
  { value: "flexible", label: "Flexible" },
];

const PAYMENT_OPTIONS = [
  "Medicare",
  "Medicaid",
  "Private insurance",
  "Private pay",
  "Veterans benefits",
  "Long-term care insurance",
];

// ── Helper Components ──

function SelectionChip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        px-3.5 py-2 rounded-xl text-[13px] font-medium transition-all duration-200
        ${selected
          ? "bg-primary-600 text-white shadow-sm"
          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
        }
      `}
    >
      {children}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[15px] font-semibold text-gray-900 mb-3">
      {children}
    </label>
  );
}

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i <= current ? "bg-primary-600 w-6" : "bg-gray-200 w-1.5"
          }`}
        />
      ))}
    </div>
  );
}

type StepId = 1 | 2 | 3 | 4;

function StepNav({
  current,
  onSelect,
}: {
  current: StepId;
  onSelect: (step: StepId) => void;
}) {
  const steps: { num: StepId; label: string }[] = [
    { num: 1, label: "Care" },
    { num: 2, label: "Location" },
    { num: 3, label: "Timeline" },
    { num: 4, label: "Details" },
  ];

  return (
    <div className="flex items-center gap-0.5 p-1 bg-gray-100 rounded-full">
      {steps.map(({ num, label }) => (
        <button
          key={num}
          type="button"
          onClick={() => onSelect(num)}
          className={`px-3.5 py-1.5 text-[13px] font-medium rounded-full transition-all ${
            current === num
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ── Component ──

interface EditCarePostModalProps {
  profile: BusinessProfile;
  userEmail?: string;
  onClose: () => void;
  onSaved: () => void;
}

const STEP_TITLES: Record<StepId, string> = {
  1: "Care Details",
  2: "Location & Schedule",
  3: "Timeline & Payment",
  4: "Additional Details",
};

const STEP_SUBTITLES: Record<StepId, string> = {
  1: "Who needs care and what type?",
  2: "Where and when do you need care?",
  3: "When do you need care to start?",
  4: "Anything else providers should know?",
};

export default function EditCarePostModal({
  profile,
  onClose,
  onSaved,
}: EditCarePostModalProps) {
  const meta = (profile.metadata || {}) as FamilyMetadata;

  // Step state
  const [step, setStep] = useState<StepId>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Care details
  const [relationship, setRelationship] = useState(meta.relationship_to_recipient || "");
  const [age, setAge] = useState(meta.age?.toString() || "");
  const [careTypes, setCareTypes] = useState<string[]>(
    Array.isArray(profile.care_types) ? [...profile.care_types] : []
  );

  // Step 2: Location & schedule
  const [city, setCity] = useState(profile.city || "");
  const [state, setState] = useState(profile.state || "");
  const [schedule, setSchedule] = useState(meta.schedule_preference || "");

  // Step 3: Timeline & payment
  const [timeline, setTimeline] = useState(meta.timeline || "");
  const [paymentMethods, setPaymentMethods] = useState<string[]>(
    Array.isArray(meta.payment_methods) ? [...meta.payment_methods] : []
  );

  // Step 4: Additional info
  const [aboutSituation, setAboutSituation] = useState(profile.description || "");
  const [phone, setPhone] = useState(profile.phone || "");

  function toggleCareType(ct: string) {
    setCareTypes((prev) =>
      prev.includes(ct) ? prev.filter((c) => c !== ct) : [...prev, ct]
    );
  }

  function togglePayment(pm: string) {
    setPaymentMethods((prev) =>
      prev.includes(pm) ? prev.filter((p) => p !== pm) : [...prev, pm]
    );
  }

  async function handleSave() {
    // If not last step, just advance
    if (step < 4) {
      setStep((step + 1) as StepId);
      return;
    }

    // Last step — save
    setSaving(true);
    setError(null);
    try {
      await saveProfile({
        profileId: profile.id,
        topLevelFields: {
          care_types: careTypes,
          city: city || undefined,
          state: state || undefined,
          phone: phone || undefined,
          description: aboutSituation || undefined,
        },
        metadataFields: {
          relationship_to_recipient: relationship || undefined,
          age: age ? parseInt(age, 10) : undefined,
          schedule_preference: schedule || undefined,
          timeline: timeline || undefined,
          payment_methods: paymentMethods.length > 0 ? paymentMethods : undefined,
        },
        existingMetadata: (profile.metadata || {}) as Record<string, unknown>,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-[600px] bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100/80">
          <StepNav current={step} onSelect={setStep} />
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-6 lg:px-8 lg:py-8 pb-24">
            {/* Step title */}
            <div className="mb-8">
              <h3 className="text-2xl font-display font-bold text-gray-900 tracking-tight">
                {STEP_TITLES[step]}
              </h3>
              <p className="text-[15px] text-gray-500 mt-1">
                {STEP_SUBTITLES[step]}
              </p>
            </div>

            {error && (
              <p className="text-sm text-red-600 mb-6" role="alert">
                {error}
              </p>
            )}

            {/* ── Step 1: Care details ── */}
            {step === 1 && (
              <div className="space-y-8">
                {/* Who needs care */}
                <div>
                  <SectionLabel>Who needs care?</SectionLabel>
                  <div className="flex flex-wrap gap-2">
                    {RELATIONSHIP_OPTIONS.map((opt) => (
                      <SelectionChip
                        key={opt.value}
                        selected={relationship === opt.value}
                        onClick={() => setRelationship(relationship === opt.value ? "" : opt.value)}
                      >
                        {opt.label}
                      </SelectionChip>
                    ))}
                  </div>
                </div>

                {/* Age */}
                <div>
                  <SectionLabel>Age of person needing care</SectionLabel>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="Enter age"
                    className="w-full max-w-[200px] px-4 py-3.5 rounded-xl bg-gray-100 border-0 focus:bg-white focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-gray-900 placeholder:text-gray-400"
                  />
                </div>

                {/* Types of care needed */}
                <div>
                  <SectionLabel>Types of care needed</SectionLabel>
                  <div className="flex flex-wrap gap-2">
                    {CARE_TYPE_OPTIONS.map((ct) => (
                      <SelectionChip
                        key={ct}
                        selected={careTypes.includes(ct)}
                        onClick={() => toggleCareType(ct)}
                      >
                        {ct}
                      </SelectionChip>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 2: Location & schedule ── */}
            {step === 2 && (
              <div className="space-y-8">
                {/* Location */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <SectionLabel>City</SectionLabel>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="e.g. Houston"
                      className="w-full px-4 py-3.5 rounded-xl bg-gray-100 border-0 focus:bg-white focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-gray-900 placeholder:text-gray-400"
                    />
                  </div>
                  <div>
                    <SectionLabel>State</SectionLabel>
                    <input
                      type="text"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      placeholder="e.g. Texas"
                      className="w-full px-4 py-3.5 rounded-xl bg-gray-100 border-0 focus:bg-white focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-gray-900 placeholder:text-gray-400"
                    />
                  </div>
                </div>

                {/* Schedule preference */}
                <div>
                  <SectionLabel>Schedule preference</SectionLabel>
                  <div className="flex flex-wrap gap-2">
                    {SCHEDULE_OPTIONS.map((opt) => (
                      <SelectionChip
                        key={opt.value}
                        selected={schedule === opt.value}
                        onClick={() => setSchedule(schedule === opt.value ? "" : opt.value)}
                      >
                        {opt.label}
                      </SelectionChip>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 3: Timeline & payment ── */}
            {step === 3 && (
              <div className="space-y-8">
                {/* Timeline */}
                <div>
                  <SectionLabel>When do you need care?</SectionLabel>
                  <div className="flex flex-wrap gap-2">
                    {TIMELINE_OPTIONS.map((opt) => (
                      <SelectionChip
                        key={opt.value}
                        selected={timeline === opt.value}
                        onClick={() => setTimeline(timeline === opt.value ? "" : opt.value)}
                      >
                        {opt.label}
                      </SelectionChip>
                    ))}
                  </div>
                </div>

                {/* Payment methods */}
                <div>
                  <SectionLabel>How do you plan to pay for care?</SectionLabel>
                  <p className="text-sm text-gray-500 -mt-1 mb-4">Select all that apply</p>
                  <div className="flex flex-wrap gap-2">
                    {PAYMENT_OPTIONS.map((pm) => (
                      <SelectionChip
                        key={pm}
                        selected={paymentMethods.includes(pm)}
                        onClick={() => togglePayment(pm)}
                      >
                        {pm}
                      </SelectionChip>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 4: Additional info ── */}
            {step === 4 && (
              <div className="space-y-8">
                {/* About situation */}
                <div>
                  <SectionLabel>Tell us about your situation</SectionLabel>
                  <textarea
                    value={aboutSituation}
                    onChange={(e) => setAboutSituation(e.target.value)}
                    placeholder="Share any details that would help providers understand your needs..."
                    rows={4}
                    className="w-full px-4 py-3.5 rounded-xl bg-gray-100 border-0 focus:bg-white focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-gray-900 placeholder:text-gray-400 resize-none"
                  />
                </div>

                {/* Phone */}
                <div>
                  <SectionLabel>Phone number</SectionLabel>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    className="w-full px-4 py-3.5 rounded-xl bg-gray-100 border-0 focus:bg-white focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-gray-900 placeholder:text-gray-400"
                  />
                  <p className="text-xs text-gray-400 mt-2">
                    Only shared with providers you connect with.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
          {/* Left: Back button */}
          <div className="w-20">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((step - 1) as StepId)}
                disabled={saving}
                className="flex items-center gap-1 text-[15px] font-medium text-gray-500 hover:text-gray-900 transition-colors disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
            )}
          </div>

          {/* Center: Progress */}
          <ProgressDots current={step - 1} total={4} />

          {/* Right: Next or Done button */}
          <div className="w-20 flex justify-end">
            {step < 4 ? (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1 text-[15px] font-semibold text-primary-600 hover:text-primary-700 transition-colors disabled:opacity-50"
              >
                Next
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-[15px] font-semibold rounded-full transition-colors"
              >
                {saving ? "Saving..." : "Done"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

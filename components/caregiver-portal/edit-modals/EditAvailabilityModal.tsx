"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import { saveStudentProfile } from "./save-profile";
import ModalFooter from "./ModalFooter";
import type { BaseEditModalProps } from "./types";
import { SEASONAL_STATUS_OPTIONS, SEASON_LABELS, getCurrentSeasonKey } from "@/lib/medjobs-helpers";

const COMMITMENT_SUGGESTIONS = [
  "I am committed to working caregiving shifts around my class schedule for at least 6 months. Outside of class and exam periods, I am available for shifts including evenings, weekends, and overnights.",
  "I plan to work as a caregiver for multiple semesters. I will keep my schedule updated and give at least 2 weeks notice before any changes. I understand reliability is critical for the families I serve.",
  "Caregiving is part of my professional development plan. I am committed to 6-12 months of consistent availability, working all hours outside of my coursework, and communicating proactively about schedule changes.",
];

const SEASONS = ["spring", "summer", "fall", "winter"] as const;

export default function EditAvailabilityModal({
  profile,
  onClose,
  onSaved,
  guidedMode,
  guidedStep,
  guidedTotal,
  onGuidedBack,
}: BaseEditModalProps) {
  const meta = profile.metadata;
  const currentSeason = getCurrentSeasonKey();
  const currentYear = new Date().getFullYear();

  const [commitmentStatement, setCommitmentStatement] = useState(meta.commitment_statement || "");
  const [prnWilling, setPrnWilling] = useState(!!meta.prn_willing);
  const [advanceNoticePledge, setAdvanceNoticePledge] = useState(!!meta.advance_notice_pledge);
  const [yearRoundAvailability, setYearRoundAvailability] = useState(meta.year_round_availability || {});
  const [availabilityNotes, setAvailabilityNotes] = useState(meta.availability_notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasChanges =
    commitmentStatement !== (meta.commitment_statement || "") ||
    prnWilling !== !!meta.prn_willing ||
    advanceNoticePledge !== !!meta.advance_notice_pledge ||
    JSON.stringify(yearRoundAvailability) !== JSON.stringify(meta.year_round_availability || {}) ||
    availabilityNotes !== (meta.availability_notes || "");

  const isValid = commitmentStatement.trim().length >= 50;

  async function handleSave() {
    if (!hasChanges && !guidedMode) {
      onClose();
      return;
    }

    if (!isValid) {
      setError("Commitment statement must be at least 50 characters");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await saveStudentProfile({
        profileId: profile.id,
        metadataFields: {
          commitment_statement: commitmentStatement.trim(),
          prn_willing: prnWilling,
          advance_notice_pledge: advanceNoticePledge,
          year_round_availability: yearRoundAvailability,
          availability_notes: availabilityNotes.trim() || null,
        },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const handleSeasonChange = (season: string, status: string) => {
    setYearRoundAvailability((prev) => ({
      ...prev,
      [season]: { status, year: currentYear },
    }));
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Availability & Commitment"
      size="lg"
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
        />
      }
    >
      <div className="space-y-5 py-2">
        {/* Section 1: Commitment Statement */}
        <div className="bg-gray-50 rounded-2xl p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-[#199087] flex items-center justify-center shrink-0">
              <span className="text-sm font-semibold text-white">1</span>
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">Your commitment statement</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                This is the #1 thing providers look at. Be specific about your availability.
              </p>
            </div>
          </div>

          {!commitmentStatement && (
            <div className="mb-4 space-y-2">
              <p className="text-xs text-gray-400 font-medium">Quick start templates:</p>
              {COMMITMENT_SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setCommitmentStatement(s)}
                  className="w-full text-left px-4 py-3 bg-white border border-gray-200 hover:border-[#199087] hover:bg-[#199087]/5 rounded-xl text-sm text-gray-600 transition-all leading-relaxed"
                >
                  {s.slice(0, 90)}...
                </button>
              ))}
            </div>
          )}

          <textarea
            value={commitmentStatement}
            onChange={(e) => setCommitmentStatement(e.target.value)}
            placeholder="Describe your commitment to taking shifts, your availability outside of class, and how long you plan to work..."
            rows={4}
            className="w-full bg-white border border-gray-200 focus:border-[#199087] focus:ring-2 focus:ring-[#199087]/20 outline-none rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 transition-all resize-none"
          />
          <div className="flex items-center justify-between mt-2">
            <span className={`text-xs ${commitmentStatement.trim().length < 50 ? "text-amber-600" : "text-gray-400"}`}>
              {commitmentStatement.trim().length < 50
                ? `${50 - commitmentStatement.trim().length} more characters needed`
                : `${commitmentStatement.trim().length} characters`
              }
            </span>
            {commitmentStatement.trim().length >= 50 && (
              <svg className="w-4 h-4 text-[#199087]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        </div>

        {/* Section 2: Additional Commitments */}
        <div className="bg-gray-50 rounded-2xl p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-[#199087] flex items-center justify-center shrink-0">
              <span className="text-sm font-semibold text-white">2</span>
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">Additional commitments</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                These show providers you understand the responsibility.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setPrnWilling(!prnWilling)}
              className={`w-full flex items-start gap-3 px-4 py-4 rounded-xl text-left transition-all ${
                prnWilling
                  ? "bg-[#199087]/10 border-2 border-[#199087]"
                  : "bg-white border border-gray-200 hover:border-gray-300"
              }`}
            >
              <span className={`inline-flex items-center justify-center w-5 h-5 rounded-md shrink-0 mt-0.5 transition-all ${
                prnWilling ? "bg-[#199087] text-white" : "border-2 border-gray-300"
              }`}>
                {prnWilling && (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
              <span className={`text-sm ${prnWilling ? "text-gray-900" : "text-gray-600"}`}>
                I am okay to be on-call / PRN until a client needs shifts that fit my schedule
              </span>
            </button>

            <button
              type="button"
              onClick={() => setAdvanceNoticePledge(!advanceNoticePledge)}
              className={`w-full flex items-start gap-3 px-4 py-4 rounded-xl text-left transition-all ${
                advanceNoticePledge
                  ? "bg-[#199087]/10 border-2 border-[#199087]"
                  : "bg-white border border-gray-200 hover:border-gray-300"
              }`}
            >
              <span className={`inline-flex items-center justify-center w-5 h-5 rounded-md shrink-0 mt-0.5 transition-all ${
                advanceNoticePledge ? "bg-[#199087] text-white" : "border-2 border-gray-300"
              }`}>
                {advanceNoticePledge && (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
              <span className={`text-sm ${advanceNoticePledge ? "text-gray-900" : "text-gray-600"}`}>
                I commit to keeping my availability and course schedule updated regularly
              </span>
            </button>
          </div>
        </div>

        {/* Section 3: Year-Round Availability */}
        <div className="bg-gray-50 rounded-2xl p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-[#199087] flex items-center justify-center shrink-0">
              <span className="text-sm font-semibold text-white">3</span>
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">Year-round availability</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                Let providers know your plans for each season.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {SEASONS.map((season) => {
              const data = yearRoundAvailability[season] as { status?: string; year?: number } | undefined;
              const isCurrent = season === currentSeason;
              return (
                <div
                  key={season}
                  className={`rounded-xl p-4 ${
                    isCurrent
                      ? "bg-[#199087]/10 border border-[#199087]/30"
                      : "bg-white border border-gray-200"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm font-medium text-gray-900">
                      {SEASON_LABELS[season]}
                    </span>
                    {isCurrent && (
                      <span className="px-2 py-0.5 bg-[#199087] text-white text-[10px] font-medium rounded-full">
                        Now
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {SEASONAL_STATUS_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleSeasonChange(season, opt.value)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          data?.status === opt.value
                            ? "bg-[#199087] text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 4: Additional Notes */}
        <div className="bg-gray-50 rounded-2xl p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center shrink-0">
              <span className="text-sm font-semibold text-white">4</span>
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">Additional notes</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                Optional: Finals, spring break, planned travel, etc.
              </p>
            </div>
          </div>

          <textarea
            value={availabilityNotes}
            onChange={(e) => setAvailabilityNotes(e.target.value)}
            placeholder="Any specific dates or circumstances providers should know about..."
            rows={3}
            className="w-full bg-white border border-gray-200 focus:border-[#199087] focus:ring-2 focus:ring-[#199087]/20 outline-none rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 transition-all resize-none"
          />
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm text-red-600" role="alert">{error}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

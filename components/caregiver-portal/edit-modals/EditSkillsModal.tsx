"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import Modal from "@/components/ui/Modal";
import { saveStudentProfile } from "./save-profile";
import type { BaseEditModalProps } from "./types";
import { SKILLS } from "@/lib/medjobs/skills";

const MAX_SKILLS = 8;

export default function EditSkillsModal({
  profile,
  onClose,
  onSaved,
  guidedMode,
  guidedStep,
  guidedTotal,
  onGuidedBack,
}: BaseEditModalProps) {
  const meta = profile.metadata;

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const [selected, setSelected] = useState<string[]>(meta.skills || []);
  const [query, setQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const hasChanges = JSON.stringify(selected) !== JSON.stringify(meta.skills || []);
  const atCap = selected.length >= MAX_SKILLS;

  const lowerQuery = query.trim().toLowerCase();
  const filtered = [...SKILLS].filter(
    (s) => !selected.includes(s) && s.toLowerCase().includes(lowerQuery)
  );

  const add = useCallback(
    (item: string) => {
      if (atCap) return;
      setSelected((prev) => [...prev, item]);
      setQuery("");
    },
    [atCap]
  );

  const remove = useCallback(
    (item: string) => setSelected((prev) => prev.filter((s) => s !== item)),
    []
  );

  // Close dropdown on outside click (check both input wrapper and portal dropdown)
  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      const clickedInWrapper = wrapperRef.current?.contains(target);
      const clickedInDropdown = dropdownRef.current?.contains(target);
      if (!clickedInWrapper && !clickedInDropdown) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  // Calculate dropdown position when open (for portal rendering)
  useEffect(() => {
    if (!dropdownOpen || !inputRef.current) {
      setDropdownPos(null);
      return;
    }
    function updatePosition() {
      if (!inputRef.current) return;
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 4, // 4px gap below input
        left: rect.left,
        width: rect.width,
      });
    }
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [dropdownOpen]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await saveStudentProfile({
        profileId: profile.id,
        metadataFields: { skills: selected },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      if (isMountedRef.current) setSaving(false);
    }
  }

  const footerContent = (
    <div className="pt-4 border-t border-gray-100">
      {guidedMode && guidedStep && guidedTotal && (
        <div className="flex gap-0.5 px-1 mb-4">
          {Array.from({ length: guidedTotal }, (_, i) => (
            <div
              key={i}
              className={`flex-1 h-[3px] rounded-full transition-colors duration-300 ${
                i + 1 <= guidedStep ? "bg-primary-600" : "bg-gray-100"
              }`}
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={guidedMode && onGuidedBack ? onGuidedBack : onClose}
          disabled={saving}
          className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50"
        >
          {guidedMode && onGuidedBack ? "Back" : "Cancel"}
        </button>

        {guidedMode && guidedStep && guidedTotal && (
          <span className="text-xs text-gray-400">
            Step {guidedStep} of {guidedTotal}
          </span>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || (!hasChanges && !guidedMode)}
          className={`px-6 py-2.5 text-sm font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
            selected.length > 0
              ? "bg-primary-600 text-white hover:bg-primary-700 shadow-sm hover:shadow"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          {saving ? (
            <span className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Saving...
            </span>
          ) : guidedMode ? (
            "Save & Next"
          ) : (
            "Done"
          )}
        </button>
      </div>
    </div>
  );

  return (
    <Modal isOpen onClose={onClose} title="" size="2xl" footer={footerContent}>
      <div className="px-2">
        <div className="min-h-[360px] flex items-start justify-center pt-4">
          <div className="w-full max-w-md mx-auto text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-primary-50 flex items-center justify-center">
              <svg className="w-10 h-10 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
              </svg>
            </div>

            <h3 className="text-xl font-semibold text-gray-900 mb-2">Skills</h3>
            <p className="text-gray-500 text-sm mb-6">
              Add the skills you have. For the best matches, add 3 to 5.
            </p>

            {/* Selected chips */}
            {selected.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2 mb-4">
                {selected.map((item) => (
                  <span
                    key={item}
                    className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1 rounded-full text-sm font-medium bg-primary-50 text-primary-800 border border-primary-200"
                  >
                    {item}
                    <button
                      type="button"
                      onClick={() => remove(item)}
                      className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-primary-200/60 transition-colors"
                      aria-label={`Remove ${item}`}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Search input + dropdown */}
            <div ref={wrapperRef} className="relative text-left">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setDropdownOpen(true); }}
                onFocus={() => setDropdownOpen(true)}
                placeholder={atCap ? `Limit reached (${MAX_SKILLS})` : "Search skills\u2026"}
                disabled={atCap}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/20 focus:border-gray-300 disabled:bg-gray-50 disabled:cursor-not-allowed"
              />

              {/* Portal-rendered dropdown to escape modal overflow clipping */}
              {dropdownOpen && filtered.length > 0 && !atCap && dropdownPos && createPortal(
                <div
                  ref={dropdownRef}
                  className="fixed bg-white border border-gray-200 rounded-xl shadow-lg z-[70] max-h-48 overflow-y-auto"
                  style={{
                    top: dropdownPos.top,
                    left: dropdownPos.left,
                    width: dropdownPos.width,
                  }}
                  onMouseDown={(e) => e.preventDefault()} // Prevent blur on input when clicking dropdown
                >
                  {filtered.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => { add(item); setDropdownOpen(true); }}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-primary-50 hover:text-primary-800 transition-colors first:rounded-t-xl last:rounded-b-xl"
                    >
                      {item}
                    </button>
                  ))}
                </div>,
                document.body
              )}
            </div>

            {selected.length > 0 && (
              <p className="text-xs text-primary-600 mt-4">
                {selected.length} skill{selected.length !== 1 ? "s" : ""} selected
              </p>
            )}
          </div>
        </div>

        {error && (
          <div className="mx-auto max-w-md mt-4 p-4 bg-red-50 border border-red-200 rounded-2xl">
            <p className="text-sm text-red-600 text-center" role="alert">{error}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

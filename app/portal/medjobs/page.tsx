"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { createBrowserClient } from "@supabase/ssr";
import type { StudentMetadata } from "@/lib/types";
import { getTrackLabel, INTENDED_SCHOOL_LABELS, SEASONAL_STATUS_OPTIONS, SEASON_LABELS, getCurrentSeasonKey, getSeasonalStatusLabel, hasVideo, getYouTubeId } from "@/lib/medjobs-helpers";
import { ScheduleBuilder, parseSchedule, serializeSchedule } from "@/components/medjobs/ScheduleBuilder";
import {
  SCENARIO_QUESTIONS,
  getVerificationItems,
  getSectionCompleteness,
  calculateCompleteness,
} from "@/lib/medjobs-completeness";
import { useCaregiverGuidedOnboarding } from "@/hooks/useCaregiverGuidedOnboarding";
import type { CaregiverSectionId } from "@/components/caregiver-portal/edit-modals/types";
import EditOverviewModal from "@/components/caregiver-portal/edit-modals/EditOverviewModal";
import EditVerificationModal from "@/components/caregiver-portal/edit-modals/EditVerificationModal";
import EditScheduleModal from "@/components/caregiver-portal/edit-modals/EditScheduleModal";
import EditAvailabilityModal from "@/components/caregiver-portal/edit-modals/EditAvailabilityModal";
import EditWhyModal from "@/components/caregiver-portal/edit-modals/EditWhyModal";
import EditScenarioModal from "@/components/caregiver-portal/edit-modals/EditScenarioModal";
import EditBackgroundModal from "@/components/caregiver-portal/edit-modals/EditBackgroundModal";
import EditResumeModal from "@/components/caregiver-portal/edit-modals/EditResumeModal";
import EditSkillsModal from "@/components/caregiver-portal/edit-modals/EditSkillsModal";
import EditCertificationsModal from "@/components/caregiver-portal/edit-modals/EditCertificationsModal";
import {
  ScheduleCard,
  AvailabilityCard,
  WhyCard,
  ScenariosCard,
  BackgroundCard,
  CertificationsCard,
  SkillsCard,
  ResumeCard,
} from "@/components/caregiver-portal/cards";
import GoLiveCelebrationModal from "@/components/caregiver-portal/GoLiveCelebrationModal";
import GoLiveReviewModal from "@/components/caregiver-portal/GoLiveReviewModal";

/* ─── Types ───────────────────────────────────────────────── */

interface StudentProfile {
  id: string;
  slug: string;
  display_name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
  image_url: string | null;
  city: string | null;
  state: string | null;
  metadata: StudentMetadata;
}

/* ─── Helpers ─────────────────────────────────────────────── */

function getCurrentSemester(): string {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  if (month >= 0 && month <= 4) return `Spring ${year}`;
  if (month >= 5 && month <= 7) return `Summer ${year}`;
  return `Fall ${year}`;
}

/* ─── Save Button with Confirmation ────────────────────────── */

function SaveButton({ saving, onClick, disabled, label = "Save" }: {
  saving: boolean; onClick: () => void; disabled?: boolean; label?: string;
}) {
  const [saved, setSaved] = useState(false);
  const prevSaving = useRef(saving);

  useEffect(() => {
    // Detect transition from saving → not saving = save completed
    if (prevSaving.current && !saving) {
      setSaved(true);
      const timer = setTimeout(() => setSaved(false), 2000);
      return () => clearTimeout(timer);
    }
    prevSaving.current = saving;
  }, [saving]);

  return (
    <button type="button" disabled={saving || disabled} onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
        saved
          ? "bg-emerald-600 text-white"
          : "bg-gray-900 hover:bg-gray-800 disabled:opacity-40 text-white"
      }`}>
      {saving ? (
        "Saving..."
      ) : saved ? (
        <span className="inline-flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          Saved
        </span>
      ) : (
        label
      )}
    </button>
  );
}

/* ─── Inline Upload ────────────────────────────────────────── */

function InlineUpload({ profileId, documentType, onComplete, accept, label }: {
  profileId: string;
  documentType: "drivers_license" | "car_insurance" | "photo" | "resume";
  onComplete: () => void;
  accept?: string;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const handleUpload = async (file: File) => {
    setError("");
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("profileId", profileId);
      if (documentType === "photo") {
        const res = await fetch("/api/medjobs/upload-photo", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Upload failed."); return; }
      } else {
        formData.append("documentType", documentType); // drivers_license, car_insurance, or resume
        const res = await fetch("/api/medjobs/upload-document", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Upload failed."); return; }
      }
      onComplete();
    } catch { setError("Network error."); }
    finally { setUploading(false); }
  };

  return (
    <>
      <input ref={inputRef} type="file"
        accept={accept || "image/*,application/pdf"}
        className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <button type="button" disabled={uploading} onClick={() => inputRef.current?.click()}
        className="px-4 py-2 bg-gray-900 hover:bg-gray-800 disabled:opacity-40 rounded-lg text-sm font-medium text-white transition-colors">
        {uploading ? "Uploading..." : (label || "Upload")}
      </button>
    </>
  );
}

/* ─── Video Submit Inline ──────────────────────────────────── */

function VideoSubmit({ slug, onComplete }: { slug: string; onComplete: () => void }) {
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!url.trim()) return;
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/medjobs/submit-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, videoUrl: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to submit."); return; }
      onComplete();
    } catch { setError("Network error."); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-3">
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Paste YouTube or Loom link"
        className="w-full border border-gray-200 focus:border-gray-900 outline-none rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 transition-colors"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <SaveButton saving={submitting} onClick={handleSubmit} disabled={!url.trim()} label="Submit video" />
    </div>
  );
}

/* ─── Metadata Editor ──────────────────────────────────────── */

function MetadataEditor({ profileId, field, value, onSave, placeholder, multiline, extraFields }: {
  profileId: string;
  field: string;
  value: string;
  onSave: () => void;
  placeholder?: string;
  multiline?: boolean;
  extraFields?: Record<string, unknown>;
}) {
  const [text, setText] = useState(value);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const doSave = useCallback(async (val: string) => {
    setStatus("saving");
    try {
      const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const { data: current } = await sb.from("business_profiles").select("metadata").eq("id", profileId).single();
      const meta = (current?.metadata || {}) as Record<string, unknown>;
      meta[field] = val.trim() || null;
      if (extraFields) { Object.assign(meta, extraFields); }
      await sb.from("business_profiles").update({ metadata: meta }).eq("id", profileId);
      setStatus("saved");
      onSave();
      setTimeout(() => setStatus("idle"), 2000);
    } catch { setStatus("idle"); }
  }, [profileId, field, extraFields, onSave]);

  const handleChange = (val: string) => {
    setText(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSave(val), 1500);
  };

  // Save on blur immediately
  const handleBlur = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text !== value) doSave(text);
  };

  return (
    <div className="relative">
      {multiline ? (
        <textarea
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          placeholder={placeholder}
          rows={4}
          className="w-full border border-gray-200 focus:border-gray-900 outline-none rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 transition-colors resize-none"
        />
      ) : (
        <input
          type="text"
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          placeholder={placeholder}
          className="w-full border border-gray-200 focus:border-gray-900 outline-none rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 transition-colors"
        />
      )}
      {status !== "idle" && (
        <span className={`absolute right-3 top-2.5 text-xs font-medium transition-opacity ${
          status === "saving" ? "text-gray-400" : "text-emerald-500"
        }`}>
          {status === "saving" ? "Saving..." : "Saved"}
        </span>
      )}
    </div>
  );
}

/* ─── Date Field Editor ────────────────────────────────────── */

function DateFieldEditor({ profileId, field, value, onSave, label, hint }: {
  profileId: string; field: string; value: string; onSave: () => void; label: string; hint?: string;
}) {
  const [date, setDate] = useState(value);
  const [saving, setSaving] = useState(false);

  const handleSave = async (newDate: string) => {
    setDate(newDate);
    setSaving(true);
    try {
      const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const { data: current } = await sb.from("business_profiles").select("metadata").eq("id", profileId).single();
      const meta = (current?.metadata || {}) as Record<string, unknown>;
      meta[field] = newDate || null;
      await sb.from("business_profiles").update({ metadata: meta }).eq("id", profileId);
      onSave();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  return (
    <div>
      <label className="block text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">{label}</label>
      {hint && <p className="text-xs text-gray-400 mb-2">{hint}</p>}
      <input
        type="date"
        value={date}
        onChange={(e) => handleSave(e.target.value)}
        disabled={saving}
        className="w-full border border-gray-200 focus:border-gray-900 outline-none rounded-lg px-3 py-2.5 text-sm text-gray-900 transition-colors disabled:opacity-50"
      />
    </div>
  );
}

/* ─── Section Card ─────────────────────────────────────────── */

function SectionCard({ label, done, children, defaultOpen, onEdit }: {
  label: string;
  done: boolean;
  children?: React.ReactNode;
  defaultOpen?: boolean;
  /** If provided, clicking the card opens a modal instead of expanding inline */
  onEdit?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen || false);

  // Modal-based card (no inline content)
  if (onEdit && !children) {
    return (
      <div className="border border-gray-100 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={onEdit}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            {done ? (
              <svg className="w-5 h-5 text-primary-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <div className="w-5 h-5 rounded-full border-2 border-gray-200 shrink-0" />
            )}
            <span className={`text-sm font-medium ${done ? "text-gray-600" : "text-gray-900"}`}>{label}</span>
          </div>
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {done ? (
            <svg className="w-5 h-5 text-primary-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <div className="w-5 h-5 rounded-full border-2 border-gray-200 shrink-0" />
          )}
          <span className={`text-sm font-medium ${done ? "text-gray-600" : "text-gray-900"}`}>{label}</span>
        </div>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-gray-50">
          <div className="pt-4">{children}</div>
        </div>
      )}
    </div>
  );
}

/* ─── Schedule Section ─────────────────────────────────────── */

function ScheduleSection({ profileId, meta, currentSemester, onSave }: {
  profileId: string; meta: StudentMetadata; currentSemester: string; onSave: () => void;
}) {
  const [grid, setGrid] = useState(() => parseSchedule(meta.course_schedule_grid));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const { data: current } = await sb.from("business_profiles").select("metadata").eq("id", profileId).single();
      const m = (current?.metadata || {}) as Record<string, unknown>;
      m.course_schedule_grid = serializeSchedule(grid);
      m.course_schedule_semester = currentSemester;
      await sb.from("business_profiles").update({ metadata: m }).eq("id", profileId);
      onSave();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  const stale = meta.course_schedule_semester && meta.course_schedule_semester !== currentSemester;

  return (
    <SectionCard label="Semester schedule" done={!!meta.course_schedule_grid} defaultOpen={!meta.course_schedule_grid}>
      <div>
        {stale && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50/60 mb-3">
            <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-amber-700">Your schedule is from {meta.course_schedule_semester}. Please update it for {currentSemester}.</p>
          </div>
        )}
        <p className="text-sm text-gray-500 mb-3">Tap to mark when you have class. Everything else = available for shifts. Update each semester.</p>
        <ScheduleBuilder value={grid} onChange={setGrid} />
        <div className="mt-4">
          <SaveButton saving={saving} onClick={handleSave} label="Save schedule" />
        </div>
      </div>
    </SectionCard>
  );
}

/* ─── Why Caregiving Section ──────────────────────────────── */

function WhyCaregivingSection({ profileId, value, onSave }: {
  profileId: string; value: string; onSave: () => void;
}) {
  const [text, setText] = useState(value);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const charCount = text.length;
  const isValid = charCount >= 100 && charCount <= 500;

  const doSave = useCallback(async (val: string) => {
    if (val.length < 100 || val.length > 500) return;
    setStatus("saving");
    try {
      const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const { data: current } = await sb.from("business_profiles").select("metadata").eq("id", profileId).single();
      const m = (current?.metadata || {}) as Record<string, unknown>;
      m.why_caregiving = val.trim();
      await sb.from("business_profiles").update({ metadata: m }).eq("id", profileId);
      setStatus("saved");
      onSave();
      setTimeout(() => setStatus("idle"), 2000);
    } catch { setStatus("idle"); }
  }, [profileId, onSave]);

  const handleChange = (val: string) => {
    setText(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.length >= 100 && val.length <= 500) {
      debounceRef.current = setTimeout(() => doSave(val), 1500);
    }
  };

  return (
    <div>
      <p className="text-sm text-gray-500 mb-2">
        This is one of the first things the families and care teams who hire you will read. Be genuine — think of it like a personal statement.
      </p>
      <div className="text-xs text-gray-400 mb-2 space-y-1">
        <p><strong>Strong answers include:</strong></p>
        <ul className="ml-3 list-disc space-y-0.5">
          <li>What personally draws you to caregiving</li>
          <li>How this connects to your career path (med school, nursing, PA, etc.)</li>
          <li>A specific experience that motivated you (family care, volunteer work, etc.)</li>
        </ul>
        <p className="mt-2 text-gray-300 italic">AI tools are fine for brainstorming, but write the final version in your own voice. Families and care teams can tell when answers feel generic — your real story is what makes you stand out.</p>
      </div>
      <div className="relative">
        <textarea
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="I want to be a caregiver because..."
          rows={5}
          maxLength={500}
          className="w-full border border-gray-200 focus:border-gray-900 outline-none rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 transition-colors resize-none"
        />
        {status !== "idle" && (
          <span className={`absolute right-3 top-2.5 text-xs font-medium ${status === "saving" ? "text-gray-400" : "text-emerald-500"}`}>
            {status === "saving" ? "Saving..." : "Saved"}
          </span>
        )}
      </div>
      <span className={`text-xs mt-1 block ${charCount < 100 ? "text-amber-500" : "text-gray-400"}`}>
        {charCount}/500 {charCount < 100 && `(${100 - charCount} more needed)`} {isValid && status === "idle" && "· Auto-saves as you type"}
      </span>
    </div>
  );
}

/* ─── Scenario Questions Section ──────────────────────────── */

function ScenarioSection({ profileId, responses, onSave }: {
  profileId: string; responses: Array<{ question: string; answer: string }>; onSave: () => void;
}) {
  const [answers, setAnswers] = useState<string[]>(() =>
    SCENARIO_QUESTIONS.map((q) => {
      const existing = responses.find((r) => r.question === q.question);
      return existing?.answer || "";
    })
  );
  const [saving, setSaving] = useState(false);
  const allValid = answers.every((a) => a.length >= 50);

  const handleSave = async () => {
    setSaving(true);
    try {
      const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const { data: current } = await sb.from("business_profiles").select("metadata").eq("id", profileId).single();
      const m = (current?.metadata || {}) as Record<string, unknown>;
      m.scenario_responses = SCENARIO_QUESTIONS.map((q, i) => ({
        question: q.question,
        answer: answers[i].trim(),
      }));
      await sb.from("business_profiles").update({ metadata: m }).eq("id", profileId);
      onSave();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  return (
    <div>
      <p className="text-sm text-gray-500 mb-2">
        Families and care teams use these answers to assess reliability, judgement, and commitment. Thoughtful, honest responses make you stand out.
      </p>
      <p className="text-xs text-gray-300 italic mb-4">
        You can use AI to organize your thoughts, but make sure the final answers reflect how you would actually respond. They may ask follow-up questions in interviews.
      </p>
      <div className="space-y-5">
        {SCENARIO_QUESTIONS.map((q, i) => (
          <div key={q.key}>
            <p className="text-sm font-medium text-gray-900 mb-2">{q.question}</p>
            <textarea
              value={answers[i]}
              onChange={(e) => { const next = [...answers]; next[i] = e.target.value; setAnswers(next); }}
              placeholder="Your answer (minimum 50 characters)..."
              rows={3}
              className="w-full border border-gray-200 focus:border-gray-900 outline-none rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 transition-colors resize-none"
            />
            <span className={`text-xs ${answers[i].length < 50 ? "text-amber-500" : "text-gray-400"}`}>
              {answers[i].length}/50 min
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4">
        <SaveButton saving={saving} onClick={handleSave} disabled={!allValid} label="Save all answers" />
        {!allValid && <p className="text-xs text-amber-500 mt-2">All questions require at least 50 characters.</p>}
      </div>
    </div>
  );
}

/* ─── Commitment Statement Section ────────────────────────── */

const COMMITMENT_SUGGESTIONS = [
  "I am committed to working caregiving shifts around my class schedule for at least 6 months. Outside of class and exam periods, I am available for shifts including evenings, weekends, and overnights.",
  "I plan to work as a caregiver for multiple semesters. I will keep my schedule updated and give at least 2 weeks notice before any changes. I understand reliability is critical for the families I serve.",
  "Caregiving is part of my professional development plan. I am committed to 6-12 months of consistent availability, working all hours outside of my coursework, and communicating proactively about schedule changes.",
];

function CommitmentStatementSection({ profileId, value, onSave }: {
  profileId: string; value: string; onSave: () => void;
}) {
  const [text, setText] = useState(value);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const isValid = text.trim().length >= 50;

  const doSave = useCallback(async (val: string) => {
    if (val.trim().length < 50) return;
    setStatus("saving");
    try {
      const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const { data: current } = await sb.from("business_profiles").select("metadata").eq("id", profileId).single();
      const m = (current?.metadata || {}) as Record<string, unknown>;
      m.commitment_statement = val.trim();
      await sb.from("business_profiles").update({ metadata: m }).eq("id", profileId);
      setStatus("saved");
      onSave();
      setTimeout(() => setStatus("idle"), 2000);
    } catch { setStatus("idle"); }
  }, [profileId, onSave]);

  const handleChange = (val: string) => {
    setText(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length >= 50) debounceRef.current = setTimeout(() => doSave(val), 1500);
  };

  return (
    <div>
      <label className="block text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">
        Commitment statement <span className="text-red-400">*</span>
      </label>
      <p className="text-xs text-gray-400 mb-2">
        Describe your commitment to taking caregiving shifts around your coursework for 6+ months. Visible to the families and care teams who hire.
      </p>
      {!text && (
        <div className="mb-3 space-y-2">
          <p className="text-xs text-gray-400">Use a suggestion as a starting point:</p>
          {COMMITMENT_SUGGESTIONS.map((s, i) => (
            <button key={i} type="button" onClick={() => { setText(s); setTimeout(() => doSave(s), 100); }}
              className="w-full text-left px-3 py-2 border border-gray-200 hover:border-gray-400 rounded-lg text-xs text-gray-600 transition-colors leading-relaxed">
              {s.slice(0, 80)}...
            </button>
          ))}
        </div>
      )}
      <div className="relative">
        <textarea
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Describe your commitment to taking shifts, your availability outside of class, and how long you plan to work..."
          rows={4}
          className="w-full border border-gray-200 focus:border-gray-900 outline-none rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 transition-colors resize-none"
        />
        {status !== "idle" && (
          <span className={`absolute right-3 top-2.5 text-xs font-medium ${status === "saving" ? "text-gray-400" : "text-emerald-500"}`}>
            {status === "saving" ? "Saving..." : "Saved"}
          </span>
        )}
      </div>
      <span className={`text-xs mt-1 block ${text.trim().length < 50 ? "text-amber-500" : "text-gray-400"}`}>
        {text.trim().length} chars {text.trim().length < 50 && `(${50 - text.trim().length} more needed)`} {isValid && status === "idle" && "· Auto-saves as you type"}
      </span>
    </div>
  );
}

/* ─── Seasonal Availability Editor ─────────────────────────── */

const SEASONS = ["spring", "summer", "fall", "winter"] as const;

function SeasonalAvailabilityEditor({ profileId, meta, onSave }: {
  profileId: string; meta: StudentMetadata; onSave: () => void;
}) {
  const currentSeason = getCurrentSeasonKey();
  const currentYear = new Date().getFullYear();
  const yra = meta.year_round_availability || {};

  const saveSeason = async (season: string, status: string, notes?: string) => {
    const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data: current } = await sb.from("business_profiles").select("metadata").eq("id", profileId).single();
    const m = (current?.metadata || {}) as Record<string, unknown>;
    const existing = (m.year_round_availability || {}) as Record<string, unknown>;
    existing[season] = { status, year: currentYear, notes: notes || undefined };
    m.year_round_availability = existing;
    await sb.from("business_profiles").update({ metadata: m }).eq("id", profileId);
    onSave();
  };

  return (
    <div>
      <label className="block text-xs text-gray-400 uppercase tracking-wide font-medium mb-3">Year-round availability</label>
      <div className="space-y-2">
        {SEASONS.map((season) => {
          const data = yra[season];
          const isCurrent = season === currentSeason;
          return (
            <div key={season} className={`rounded-lg border p-3 ${isCurrent ? "border-primary-200 bg-primary-50/30" : "border-gray-100"}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-900">
                  {SEASON_LABELS[season]} {isCurrent ? currentYear : season === "winter" ? `${currentYear}–${currentYear + 1}` : currentYear}
                  {isCurrent && <span className="ml-2 text-xs text-primary-600 font-normal">(current)</span>}
                </span>
                {isCurrent && meta.course_schedule_grid && (
                  <span className="text-xs text-primary-600">See class schedule above</span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SEASONAL_STATUS_OPTIONS
                  .filter((o) => !(isCurrent && meta.course_schedule_grid && o.value !== "classes_see_schedule"))
                  .map((opt) => (
                    <button key={opt.value} type="button"
                      onClick={() => saveSeason(season, opt.value)}
                      className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                        data?.status === opt.value ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}>
                      {opt.label}
                    </button>
                  ))}
              </div>
              {data?.notes && (
                <p className="text-xs text-gray-500 mt-2">{data.notes}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Availability & Commitment Section ───────────────────── */


function AvailabilityCommitmentSection({ profileId, meta, onSave }: {
  profileId: string; meta: StudentMetadata; onSave: () => void;
}) {
  const [prnWilling, setPrnWilling] = useState(!!meta.prn_willing);
  const [scheduleAttestation, setScheduleAttestation] = useState(!!meta.advance_notice_pledge);
  const [saving, setSaving] = useState(false);

  const saveToggle = async (field: string, value: boolean) => {
    setSaving(true);
    try {
      const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const { data: current } = await sb.from("business_profiles").select("metadata").eq("id", profileId).single();
      const m = (current?.metadata || {}) as Record<string, unknown>;
      m[field] = value;
      await sb.from("business_profiles").update({ metadata: m }).eq("id", profileId);
      onSave();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  return (
    <SectionCard label="Availability & commitment" done={!!(meta.hours_per_week_range && meta.commitment_statement)}>
      <div className="space-y-5">
        <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50/60">
          <svg className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs text-blue-700 leading-relaxed">
            This is the #1 thing families and care teams look at. They need to know you&apos;re committed to taking shifts around coursework for 6+ months.
          </p>
        </div>

        <dl className="space-y-2 text-sm">
          {meta.hours_per_week_range && <div className="flex justify-between"><dt className="text-gray-500">Hours/week</dt><dd className="text-gray-900">{meta.hours_per_week_range} hrs</dd></div>}
          {meta.duration_commitment && <div className="flex justify-between"><dt className="text-gray-500">Length of commitment</dt><dd className="text-gray-900">{meta.duration_commitment.replace(/_/g, " ").replace(/less_than/, "< ").replace(/to/g, "–")}</dd></div>}
        </dl>

        <CommitmentStatementSection profileId={profileId} value={meta.commitment_statement || ""} onSave={onSave} />

        {/* Flexibility & accountability pledges */}
        <div>
          <label className="block text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">Additional commitments</label>
          <p className="text-xs text-gray-400 mb-3">These show families and care teams you understand the responsibility. Check all that apply.</p>
          <div className="space-y-2">
            <button type="button" disabled={saving}
              onClick={() => { const next = !prnWilling; setPrnWilling(next); saveToggle("prn_willing", next); }}
              className={`w-full flex items-start gap-3 px-4 py-3 rounded-lg text-left transition-all ${
                prnWilling ? "border-2 border-gray-900 bg-gray-50" : "border border-gray-200 hover:border-gray-300"
              }`}>
              <span className={`inline-flex items-center justify-center w-5 h-5 rounded border-2 shrink-0 mt-0.5 transition-colors ${
                prnWilling ? "bg-gray-900 border-gray-900 text-white" : "border-gray-300"
              }`}>
                {prnWilling && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
              </span>
              <span className="text-sm text-gray-700">I am okay to be on-call / PRN until a family needs shifts that fit my schedule</span>
            </button>

            <button type="button" disabled={saving}
              onClick={() => { const next = !scheduleAttestation; setScheduleAttestation(next); saveToggle("advance_notice_pledge", next); }}
              className={`w-full flex items-start gap-3 px-4 py-3 rounded-lg text-left transition-all ${
                scheduleAttestation ? "border-2 border-gray-900 bg-gray-50" : "border border-gray-200 hover:border-gray-300"
              }`}>
              <span className={`inline-flex items-center justify-center w-5 h-5 rounded border-2 shrink-0 mt-0.5 transition-colors ${
                scheduleAttestation ? "bg-gray-900 border-gray-900 text-white" : "border-gray-300"
              }`}>
                {scheduleAttestation && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
              </span>
              <span className="text-sm text-gray-700">I commit to keeping my availability and course schedule updated regularly and will work with office staff if anything changes</span>
            </button>
          </div>
        </div>

        {/* Year-round availability */}
        <SeasonalAvailabilityEditor profileId={profileId} meta={meta} onSave={onSave} />

        <DateFieldEditor profileId={profileId} field="schedule_update_date" value={meta.schedule_update_date || ""} onSave={onSave}
          label="Schedule update date" hint="When does your current schedule end? We'll remind you to update." />

        <AvailabilityNotesSection profileId={profileId} value={meta.availability_notes || ""} onSave={onSave} />
      </div>
    </SectionCard>
  );
}

/* ─── Suggested Text Editor (reusable) ─────────────────────── */

function SuggestedTextEditor({ label, profileId, field, value, suggestions, placeholder, onSave }: {
  label: string; profileId: string; field: string; value: string;
  suggestions: string[]; placeholder?: string; onSave: () => void;
}) {
  const [text, setText] = useState(value);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const doSave = useCallback(async (val: string) => {
    setStatus("saving");
    try {
      const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const { data: current } = await sb.from("business_profiles").select("metadata").eq("id", profileId).single();
      const m = (current?.metadata || {}) as Record<string, unknown>;
      m[field] = val.trim() || null;
      await sb.from("business_profiles").update({ metadata: m }).eq("id", profileId);
      setStatus("saved");
      onSave();
      setTimeout(() => setStatus("idle"), 2000);
    } catch { setStatus("idle"); }
  }, [profileId, field, onSave]);

  const handleChange = (val: string) => {
    setText(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSave(val), 1500);
  };

  const selectSuggestion = (s: string) => {
    setText(s);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setTimeout(() => doSave(s), 100);
  };

  return (
    <div>
      <label className="block text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">{label}</label>
      {!text && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {suggestions.map((s) => (
            <button key={s} type="button" onClick={() => selectSuggestion(s)}
              className="px-2.5 py-1 rounded-full text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="relative">
        <input
          type="text"
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={placeholder || "Or type your own..."}
          className="w-full border border-gray-200 focus:border-gray-900 outline-none rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 transition-colors"
        />
        {status !== "idle" && (
          <span className={`absolute right-3 top-2.5 text-xs font-medium ${status === "saving" ? "text-gray-400" : "text-emerald-500"}`}>
            {status === "saving" ? "Saving..." : "Saved"}
          </span>
        )}
      </div>
    </div>
  );
}

/* ─── Availability Notes Section ──────────────────────────── */

const AVAILABILITY_SNIPPETS = [
  "I have no planned travel and am available for shifts anytime outside of class.",
  "I can pick up additional shifts during holidays and semester breaks.",
  "I have reliable transportation and can drive to clients within 30 minutes.",
  "I am flexible with short-notice shift changes and happy to cover for others.",
  "I will update my profile with specific finals and travel dates as they are confirmed.",
];

function AvailabilityNotesSection({ profileId, value, onSave }: {
  profileId: string; value: string; onSave: () => void;
}) {
  const [text, setText] = useState(value);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const appendSnippet = (snippet: string) => {
    const newText = text ? `${text}\n${snippet}` : snippet;
    setText(newText);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSave(newText), 500);
  };

  const doSave = useCallback(async (val: string) => {
    setStatus("saving");
    try {
      const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const { data: current } = await sb.from("business_profiles").select("metadata").eq("id", profileId).single();
      const m = (current?.metadata || {}) as Record<string, unknown>;
      m.availability_notes = val.trim() || null;
      await sb.from("business_profiles").update({ metadata: m }).eq("id", profileId);
      setStatus("saved");
      onSave();
      setTimeout(() => setStatus("idle"), 2000);
    } catch { setStatus("idle"); }
  }, [profileId, onSave]);

  const handleChange = (val: string) => {
    setText(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSave(val), 1500);
  };

  return (
    <div>
      <label className="block text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Availability notes</label>
      <p className="text-xs text-gray-400 mb-2">Finals, spring break, known travel — the more detail, the better your chances. Tap to add:</p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {AVAILABILITY_SNIPPETS.map((s) => (
          <button key={s} type="button" onClick={() => appendSnippet(s)}
            className="px-2.5 py-1 rounded-full text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors text-left">
            + {s.length > 45 ? s.slice(0, 45) + "..." : s}
          </button>
        ))}
      </div>
      <div className="relative">
        <textarea
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Build your availability notes using the suggestions above, or type your own..."
          rows={4}
          className="w-full border border-gray-200 focus:border-gray-900 outline-none rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 transition-colors resize-none"
        />
        {status !== "idle" && (
          <span className={`absolute right-3 top-2.5 text-xs font-medium ${status === "saving" ? "text-gray-400" : "text-emerald-500"}`}>
            {status === "saving" ? "Saving..." : "Saved"}
          </span>
        )}
      </div>
      <span className="text-xs text-gray-400 mt-1 block">Auto-saves as you type</span>
    </div>
  );
}

/* ─── Background Section ──────────────────────────────────── */

const EXPERIENCE_OPTIONS = [
  { value: "0", label: "No experience yet, eager to learn" },
  { value: "family", label: "Experience caring for family or friends" },
  { value: "1", label: "1\u20132 years (paid or volunteer)" },
  { value: "3", label: "3+ years" },
];
const CERTIFICATION_OPTIONS = ["CNA", "BLS", "CPR / First Aid", "HHA", "Medication Aide", "Phlebotomy"];
const CARE_TYPE_OPTIONS = [
  "Dementia / Alzheimer's", "Post-Surgical Care", "Mobility Assistance",
  "Medication Management", "Personal Care", "Companionship",
  "Meal Preparation", "Hospice / End-of-Life", "Family member care",
];
const LANGUAGE_OPTIONS = ["English", "Spanish", "Mandarin", "Vietnamese", "Hindi", "Tagalog", "Arabic", "Korean", "French", "Other"];

function BackgroundSection({ profileId, meta, onSave }: {
  profileId: string; meta: StudentMetadata; onSave: () => void;
}) {
  const [saving, setSaving] = useState(false);

  const saveField = async (field: string, value: unknown) => {
    setSaving(true);
    try {
      const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const { data: current } = await sb.from("business_profiles").select("metadata").eq("id", profileId).single();
      const m = (current?.metadata || {}) as Record<string, unknown>;
      m[field] = value;
      await sb.from("business_profiles").update({ metadata: m }).eq("id", profileId);
      onSave();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  const toggleArrayItem = (field: string, current: string[], item: string) => {
    const next = current.includes(item) ? current.filter((i) => i !== item) : [...current, item];
    saveField(field, next);
  };

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">Experience level</label>
        <div className="flex flex-wrap gap-1.5">
          {EXPERIENCE_OPTIONS.map((opt) => (
            <button key={opt.value} type="button" onClick={() => saveField("years_caregiving", opt.value === "family" ? 0 : Number(opt.value))} disabled={saving}
              className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
                String(meta.years_caregiving) === opt.value || (opt.value === "family" && meta.years_caregiving === 0)
                  ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">Certifications</label>
        <div className="flex flex-wrap gap-1.5">
          {CERTIFICATION_OPTIONS.map((c) => (
            <button key={c} type="button" onClick={() => toggleArrayItem("certifications", meta.certifications || [], c)} disabled={saving}
              className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
                (meta.certifications || []).includes(c) ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">Types of care you can provide</label>
        <div className="flex flex-wrap gap-1.5">
          {CARE_TYPE_OPTIONS.map((c) => (
            <button key={c} type="button" onClick={() => toggleArrayItem("care_experience_types", meta.care_experience_types || [], c)} disabled={saving}
              className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
                (meta.care_experience_types || []).includes(c) ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">Languages</label>
        <div className="flex flex-wrap gap-1.5">
          {LANGUAGE_OPTIONS.map((l) => (
            <button key={l} type="button" onClick={() => toggleArrayItem("languages", meta.languages || [], l)} disabled={saving}
              className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
                (meta.languages || []).includes(l) ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}>
              {l}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Page ─────────────────────────────────────────────────── */

export default function StudentPortalPage() {
  const { user, account, profiles, isLoading: authLoading } = useAuth();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const retryRef = useRef(false);

  useEffect(() => {
    if (authLoading) return;
    const studentProfile = profiles?.find((p) => p.type === "student");
    if (studentProfile) { fetchFullProfile(studentProfile.id); return; }
    if (account?.id) { fetchByAccount(account.id); return; }
    // Fallback: if auth loaded but no account/profiles yet, try by email
    if (user?.email) { fetchByEmail(user.email); return; }
    // If nothing found and we haven't retried yet, wait and retry
    // (handles race condition where auth session established but profiles not yet loaded)
    if (!retryRef.current && user) {
      retryRef.current = true;
      setTimeout(() => setRefreshKey((k) => k + 1), 1500);
      return;
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, account?.id, profiles, refreshKey, user?.email]);

  const fetchFullProfile = useCallback(async (profileId: string) => {
    try {
      const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const { data } = await sb.from("business_profiles").select("id, slug, display_name, email, phone, is_active, image_url, city, state, metadata").eq("id", profileId).single();
      if (data) setProfile(data as StudentProfile);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  const fetchByAccount = useCallback(async (accountId: string) => {
    try {
      const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const { data } = await sb.from("business_profiles").select("id, slug, display_name, email, phone, is_active, image_url, city, state, metadata").eq("account_id", accountId).eq("type", "student").limit(1).maybeSingle();
      if (data) setProfile(data as StudentProfile);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  const fetchByEmail = useCallback(async (email: string) => {
    try {
      const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const { data } = await sb.from("business_profiles").select("id, slug, display_name, email, phone, is_active, image_url, city, state, metadata").eq("email", email).eq("type", "student").limit(1).maybeSingle();
      if (data) setProfile(data as StudentProfile);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  const refresh = () => setRefreshKey((k) => k + 1);

  /* ── Loading / Empty states ── */

  if (authLoading || loading) {
    return <main className="min-h-screen bg-[#FAFAF8] flex items-center justify-center"><div className="text-gray-300 text-sm">Loading...</div></main>;
  }

  if (!profile) {
    return (
      <main className="min-h-screen bg-[#FAFAF8] flex items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <h1 className="text-2xl font-semibold text-gray-900 mb-3">No profile yet</h1>
          <p className="text-gray-400 mb-6">Apply to MedJobs to get started.</p>
          <Link href="/medjobs/apply" className="inline-flex items-center justify-center px-6 py-3 bg-gray-900 hover:bg-gray-800 rounded-lg text-sm font-semibold text-white transition-colors">
            Apply now
          </Link>
        </div>
      </main>
    );
  }

  // Once profile is loaded, render the main content component
  // (separated so hooks like useGuidedOnboarding can be called unconditionally)
  return (
    <StudentPortalContent
      profile={profile}
      refresh={refresh}
    />
  );
}

/* ─── Main Content Component ─────────────────────────────────── */

function StudentPortalContent({
  profile,
  refresh,
}: {
  profile: StudentProfile;
  refresh: () => void;
}) {
  const [editingSection, setEditingSection] = useState<CaregiverSectionId | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [pendingCelebration, setPendingCelebration] = useState(false);
  const [showGoLiveReview, setShowGoLiveReview] = useState(false);
  // Track if profile was live when verification modal opened (to detect first-time going live)
  const wasLiveOnModalOpen = useRef(profile.is_active);

  // Collapsible completeness card state - start expanded for new profiles
  const [isCompletenessExpanded, setIsCompletenessExpanded] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem("olera-student-completeness-expanded");
    return saved === null ? true : saved === "true";
  });
  const toggleCompleteness = () => {
    const newValue = !isCompletenessExpanded;
    setIsCompletenessExpanded(newValue);
    localStorage.setItem("olera-student-completeness-expanded", String(newValue));
  };

  const meta = profile.metadata || {} as StudentMetadata;
  const hasPhoto = !!profile.image_url;
  const verificationItems = getVerificationItems(meta);
  const verificationDone = verificationItems.every((v) => v.done);

  // Video verification
  const videoAvailable = hasVideo(meta);
  const youtubeId = videoAvailable && meta.video_intro_url ? getYouTubeId(meta.video_intro_url) : null;

  // Basic info from onboarding - these are typically already complete
  const hasBasicInfo = {
    hasName: !!profile.display_name,
    hasUniversity: !!meta.university,
    hasLocation: !!(profile.city && profile.state),
  };

  // Section-based completeness (8 logical sections)
  const completeSections = getSectionCompleteness(meta, hasPhoto, hasBasicInfo);
  const completenessPercent = calculateCompleteness(meta, hasPhoto, hasBasicInfo);

  // Convert sections to items format for guided onboarding hook
  const completenessItems = completeSections.map((s) => ({
    key: s.id,
    label: s.label,
    done: s.done,
    category: "profile" as const,
  }));

  // Guided onboarding hook
  const guided = useCaregiverGuidedOnboarding({
    overall: completenessPercent,
    items: completenessItems,
  });

  // Modal handlers
  const handleCloseModal = useCallback(() => {
    setEditingSection(null);
    if (guided.isGuidedActive) {
      guided.stopGuided();
    }
  }, [guided]);

  const handleSaved = useCallback(() => {
    refresh();
    if (guided.isGuidedActive && editingSection) {
      const next = guided.getNextSection(editingSection);
      if (next) {
        setEditingSection(next);
      } else {
        setEditingSection(null);
        guided.stopGuided();
      }
    } else {
      setEditingSection(null);
    }
  }, [refresh, guided, editingSection]);

  // Special handler for verification modal that checks if profile just went live
  const handleVerificationSaved = useCallback(() => {
    const wasLive = wasLiveOnModalOpen.current;
    refresh();
    // Mark pending celebration if profile wasn't live when modal opened
    // The effect below will show celebration when profile.is_active becomes true
    if (!wasLive) {
      setPendingCelebration(true);
    }
    if (guided.isGuidedActive && editingSection) {
      const next = guided.getNextSection(editingSection);
      if (next) {
        setEditingSection(next);
      } else {
        setEditingSection(null);
        guided.stopGuided();
      }
    } else {
      setEditingSection(null);
    }
  }, [refresh, guided, editingSection]);

  // Effect to show celebration when profile becomes active after verification save
  useEffect(() => {
    if (pendingCelebration && profile.is_active) {
      setShowCelebration(true);
      setPendingCelebration(false);
    }
  }, [pendingCelebration, profile.is_active]);

  // Update ref when verification modal opens
  const handleOpenVerificationModal = useCallback(() => {
    wasLiveOnModalOpen.current = profile.is_active;
    setEditingSection("verification");
  }, [profile.is_active]);

  const handleGuidedBack = useCallback(() => {
    if (editingSection) {
      const prev = guided.getPrevSection(editingSection);
      if (prev) {
        setEditingSection(prev);
      }
    }
  }, [editingSection, guided]);

  // Shared modal props
  const modalProps = {
    profile: profile as import("@/components/caregiver-portal/edit-modals/types").StudentProfile,
    onClose: handleCloseModal,
    onSaved: handleSaved,
    guidedMode: guided.isGuidedActive,
    guidedStep: editingSection ? guided.getStepNumber(editingSection) : 1,
    guidedTotal: guided.totalSteps,
    onGuidedBack: editingSection && guided.getPrevSection(editingSection)
      ? handleGuidedBack
      : undefined,
  };

  // Verification modal uses special save handler to detect going live
  const verificationModalProps = {
    ...modalProps,
    onSaved: handleVerificationSaved,
  };
  const trackLabel = getTrackLabel(meta);
  const currentSemester = getCurrentSemester();

  // Find the first incomplete verification item to auto-open
  const nextVerification = verificationItems.find((v) => !v.done);

  return (
    <main className="min-h-screen bg-gradient-to-b from-vanilla-50 via-white to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* ── Grid: Main + Sidebar ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

          {/* ── Main Column (2/3) ── */}
          <div className="lg:col-span-2 space-y-6">
            {/* Profile Header Card — with photo upload */}
            <div id="overview" className="bg-white rounded-2xl border border-gray-200/80 p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 relative">
                  {profile.image_url ? (
                    <img src={profile.image_url} alt="" className="w-20 h-20 rounded-xl object-cover ring-2 ring-primary-100 ring-offset-2" />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingSection("overview")}
                      className="group relative w-20 h-20 rounded-xl bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center shadow-sm shadow-primary-500/10 border-2 border-dashed border-primary-300 hover:border-primary-500 transition-all cursor-pointer"
                    >
                      <span className="text-xl font-display font-bold text-primary-700 group-hover:opacity-30 transition-opacity">
                        {profile.display_name?.split(" ").filter(Boolean).map((n) => n[0]).slice(0, 2).join("").toUpperCase() || "?"}
                      </span>
                      <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                        </svg>
                        <span className="text-[9px] font-semibold text-primary-600 mt-0.5">Add photo</span>
                      </div>
                    </button>
                  )}
                  {!profile.image_url && (
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center shadow-sm">
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  {/* Track label */}
                  {trackLabel && (
                    <p className="text-xs font-semibold tracking-widest text-primary-600 uppercase mb-1">
                      {trackLabel}
                    </p>
                  )}
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-xl font-display font-bold text-gray-900 truncate">{profile.display_name}</h1>
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      profile.is_active ? "bg-primary-50 text-primary-700" : verificationDone ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-500"
                    }`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${
                        profile.is_active ? "bg-primary-500 animate-pulse" : verificationDone ? "bg-amber-500" : "bg-gray-300"
                      }`} />
                      {profile.is_active ? "Live" : verificationDone ? "Under review" : "Not verified"}
                    </div>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[15px] text-gray-500">
                    {meta.university && <span>{meta.university}</span>}
                    {meta.major && <><span className="text-gray-300">·</span><span>{meta.major}</span></>}
                    {profile.city && profile.state && <><span className="text-gray-300">·</span><span>{profile.city}, {profile.state}</span></>}
                  </div>
                  {profile.is_active && (
                    <a
                      href={`/medjobs/candidates/${profile.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2.5 inline-flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      View public profile
                    </a>
                  )}
                </div>
                {/* Edit button — circular style matching other section cards */}
                <button
                  type="button"
                  onClick={() => setEditingSection("overview")}
                  className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-900 hover:text-primary-600 hover:border-primary-300 hover:bg-primary-50 transition-all duration-200 shrink-0"
                  aria-label="Edit profile overview"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Individual Profile Section Cards */}
            <ScheduleCard meta={meta} onEdit={() => setEditingSection("schedule")} />
            <AvailabilityCard meta={meta} onEdit={() => setEditingSection("availability")} />
            <WhyCard meta={meta} onEdit={() => setEditingSection("why")} />
            <ScenariosCard meta={meta} onEdit={() => setEditingSection("scenarios")} />
            <BackgroundCard meta={meta} onEdit={() => setEditingSection("background")} />
            <CertificationsCard meta={meta} onEdit={() => setEditingSection("certifications")} />
            <SkillsCard meta={meta} onEdit={() => setEditingSection("skills")} />
            <ResumeCard meta={meta} onEdit={() => setEditingSection("resume")} />

            {/* Verification Card — Final step to go live */}
            <div id="verification" className="bg-white rounded-2xl border border-gray-200/80 p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-gray-900">Verification</h2>
                  {verificationDone ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-50 text-primary-700 text-xs font-medium rounded-full">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      Complete
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">
                      {verificationItems.filter((v) => v.done).length} of {verificationItems.length}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleOpenVerificationModal}
                  className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-900 hover:text-primary-600 hover:border-primary-300 hover:bg-primary-50 transition-all duration-200"
                  aria-label="Edit verification"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                </button>
              </div>

              {/* Empty State - No verifications yet */}
              {verificationItems.every((v) => !v.done) ? (
                <button
                  type="button"
                  onClick={handleOpenVerificationModal}
                  className="w-full group"
                >
                  <div className="flex items-center gap-4 p-4 rounded-xl border-2 border-dashed border-gray-200 hover:border-gray-300 hover:bg-gray-50/50 transition-all">
                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center group-hover:bg-gray-200 transition-colors">
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                      </svg>
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium text-gray-900">Get verified to go live</p>
                      <p className="text-xs text-gray-500 mt-0.5">Add intro video, license, and insurance</p>
                    </div>
                    <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ) : (
                <div className="space-y-3">
                  {/* Video row - compact thumbnail when available */}
                  {videoAvailable && (
                    <div className="flex items-center gap-3">
                      {/* Compact video thumbnail */}
                      <a
                        href={meta.video_intro_url || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="relative w-20 h-14 rounded-lg overflow-hidden bg-gray-900 flex-shrink-0 group"
                      >
                        {youtubeId ? (
                          <img
                            src={`https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`}
                            alt="Video thumbnail"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-primary-600 to-primary-800" />
                        )}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
                          <div className="w-7 h-7 rounded-full bg-white/90 flex items-center justify-center">
                            <svg className="w-3 h-3 text-gray-900 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </div>
                        </div>
                      </a>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">Intro video</p>
                        <p className="text-xs text-primary-600">Uploaded</p>
                      </div>
                      <svg className="w-5 h-5 text-primary-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}

                  {/* Document verification items - compact horizontal rows */}
                  {verificationItems.filter(item => item.key !== "video").map((item) => {
                    const isDone = item.done;
                    const expiration = item.key === "drivers_license" ? meta.drivers_license_expiration : meta.car_insurance_expiration;

                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={handleOpenVerificationModal}
                        className="w-full flex items-center gap-3 text-left group"
                      >
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                          isDone ? "bg-primary-50" : "bg-gray-100 group-hover:bg-gray-200"
                        }`}>
                          {item.key === "drivers_license" ? (
                            <svg className={`w-5 h-5 ${isDone ? "text-primary-600" : "text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z" />
                            </svg>
                          ) : (
                            <svg className={`w-5 h-5 ${isDone ? "text-primary-600" : "text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">{item.label}</p>
                          <p className={`text-xs ${isDone ? "text-primary-600" : "text-gray-400"}`}>
                            {isDone ? (expiration ? `Expires ${expiration}` : "Uploaded") : "Not uploaded"}
                          </p>
                        </div>
                        {isDone ? (
                          <svg className="w-5 h-5 text-primary-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <div className="w-5 h-5 rounded-full border-2 border-gray-200 flex-shrink-0 group-hover:border-gray-300 transition-colors" />
                        )}
                      </button>
                    );
                  })}

                  {/* Show video row if not available (need to add it) */}
                  {!videoAvailable && (
                    <button
                      type="button"
                      onClick={handleOpenVerificationModal}
                      className="w-full flex items-center gap-3 text-left group"
                    >
                      <div className="w-10 h-10 rounded-lg bg-gray-100 group-hover:bg-gray-200 flex items-center justify-center flex-shrink-0 transition-colors">
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">Intro video</p>
                        <p className="text-xs text-gray-400">Not uploaded</p>
                      </div>
                      <div className="w-5 h-5 rounded-full border-2 border-gray-200 flex-shrink-0 group-hover:border-gray-300 transition-colors" />
                    </button>
                  )}

                  {/* CTA if not complete */}
                  {!verificationDone && (
                    <button
                      type="button"
                      onClick={handleOpenVerificationModal}
                      className="w-full mt-2 py-2.5 px-4 bg-gray-900 hover:bg-gray-800 rounded-xl text-sm font-medium text-white transition-colors"
                    >
                      Continue verification
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Sidebar (1/3) ── */}
          <div className="lg:col-span-1 space-y-6">
            {/* Go Live CTA - only shows when profile is inactive */}
            {!profile.is_active && (
              <div className="bg-white rounded-2xl border border-gray-200/80 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-sm font-medium text-gray-900">Not live yet</span>
                </div>
                <p className="text-sm text-gray-600 mb-4">
                  Make your profile visible to providers and start getting matched with jobs.
                </p>
                <button
                  type="button"
                  onClick={() => setShowGoLiveReview(true)}
                  className="w-full px-4 py-3 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-xl transition-all hover:shadow-lg"
                >
                  Go Live
                </button>
              </div>
            )}

            {/* Completeness - Collapsible */}
            <div className="bg-gradient-to-b from-white to-vanilla-50 rounded-2xl border border-gray-200/80 overflow-hidden">
              {/* Header - always visible, clickable to toggle */}
              <button
                type="button"
                onClick={toggleCompleteness}
                className="w-full flex items-center justify-between p-5 hover:bg-vanilla-50/50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <h3 className="text-base font-display font-bold text-gray-900">
                    Profile completeness
                  </h3>
                  {!isCompletenessExpanded && (
                    <span className="text-sm font-semibold text-primary-600">
                      {completenessPercent}%
                    </span>
                  )}
                </div>
                <svg
                  className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${
                    isCompletenessExpanded ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Collapsed state - compact progress bar */}
              {!isCompletenessExpanded && (
                <div className="px-5 pb-4 -mt-2">
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary-500 rounded-full transition-all duration-500"
                      style={{ width: `${completenessPercent}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    {completeSections.filter((s) => s.done).length} of {completeSections.length} sections complete
                  </p>
                </div>
              )}

              {/* Expanded state - full donut + checklist */}
              {isCompletenessExpanded && (
                <div className="px-5 pb-5 -mt-2">
                  {/* Circular progress */}
                  <div className="flex justify-center mb-2">
                    <div className="relative w-[90px] h-[90px]">
                      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="42" fill="none" stroke="#f3f4f6" strokeWidth="8" />
                        <circle
                          cx="50" cy="50" r="42" fill="none"
                          stroke="#199087"
                          strokeWidth="8"
                          strokeLinecap="round"
                          strokeDasharray={`${completenessPercent * 2.64} 264`}
                          className="transition-all duration-500"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xl font-bold text-gray-900">{completenessPercent}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Status message */}
                  <p className="text-center text-xs font-semibold tracking-wide uppercase text-gray-900 font-display mb-0.5">
                    {completenessPercent >= 100 ? "ALL DONE!" :
                     completenessPercent >= 76 ? "NEARLY COMPLETE!" :
                     completenessPercent >= 51 ? "LOOKING GOOD!" :
                     completenessPercent >= 26 ? "ALMOST THERE!" :
                     "JUST GETTING STARTED"}
                  </p>
                  <p className="text-center text-[11px] text-gray-400 mb-4">
                    Complete your application to get matched
                  </p>

                  {/* Section checklist - only highlight incomplete items */}
                  <div className="space-y-0.5">
                    {completeSections.map((section) => (
                      <a
                        key={section.id}
                        href={`#${section.id}`}
                        className="flex items-center justify-between py-2 px-2 -mx-2 rounded-lg hover:bg-vanilla-100 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          {section.done ? (
                            <div className="w-4 h-4 rounded-full bg-primary-600 flex items-center justify-center shrink-0">
                              <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          ) : section.percent > 0 ? (
                            <div className="w-4 h-4 rounded-full border-2 border-primary-300 bg-primary-50 shrink-0 flex items-center justify-center">
                              <div className="w-1.5 h-1.5 rounded-full bg-primary-400" />
                            </div>
                          ) : (
                            <div className="w-4 h-4 rounded-full border-2 border-gray-200 shrink-0" />
                          )}
                          <span className={`text-sm ${section.done ? "text-gray-500" : "text-gray-700"}`}>
                            {section.label}
                          </span>
                        </div>
                        {/* Only show percentage for incomplete items - draws eye to what's left */}
                        {!section.done && (
                          <span className={`text-xs font-medium ${section.percent > 0 ? "text-primary-600" : "text-gray-400"}`}>
                            {section.percent}%
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modals */}
      {editingSection === "overview" && <EditOverviewModal {...modalProps} />}
      {editingSection === "verification" && <EditVerificationModal {...verificationModalProps} />}
      {editingSection === "schedule" && <EditScheduleModal {...modalProps} />}
      {editingSection === "availability" && <EditAvailabilityModal {...modalProps} />}
      {editingSection === "why" && <EditWhyModal {...modalProps} />}
      {editingSection === "scenarios" && <EditScenarioModal {...modalProps} />}
      {editingSection === "background" && <EditBackgroundModal {...modalProps} />}
      {editingSection === "certifications" && <EditCertificationsModal {...modalProps} />}
      {editingSection === "skills" && <EditSkillsModal {...modalProps} />}
      {editingSection === "resume" && <EditResumeModal {...modalProps} />}

      {/* Go Live Review Modal */}
      <GoLiveReviewModal
        isOpen={showGoLiveReview}
        onClose={() => {
          setShowGoLiveReview(false);
          refresh();
        }}
        profileId={profile.id}
        sections={completeSections}
        onGoLive={() => {
          refresh();
        }}
      />

      {/* Celebration Modal - shown when profile goes live */}
      <GoLiveCelebrationModal
        isOpen={showCelebration && profile.is_active}
        onClose={() => setShowCelebration(false)}
        profileSlug={profile.slug}
      />
    </main>
  );
}

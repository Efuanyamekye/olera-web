"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import type { IntendedProfessionalSchool } from "@/lib/types";
import { createBrowserClient } from "@supabase/ssr";
import { useCitySearch } from "@/hooks/use-city-search";
import { LifecycleProgress } from "@/components/medjobs/LifecycleProgress";
import { ReactiveHint } from "@/components/medjobs/Tooltip";

/* ─── Constants ────────────────────────────────────────────── */

const INTENDED_SCHOOLS: { value: IntendedProfessionalSchool; label: string }[] = [
  { value: "medicine", label: "Medicine" },
  { value: "nursing", label: "Nursing" },
  { value: "pa", label: "Physician Assistant (PA)" },
  { value: "pt", label: "Physical Therapy (PT)" },
  { value: "public_health", label: "Public Health" },
  { value: "undecided", label: "Undecided" },
];

const MAJORS = [
  "Biology", "Kinesiology", "Nursing", "Public Health", "Chemistry",
  "Psychology", "Health Sciences", "Pre-Med", "Other",
];



const DURATION_OPTIONS = [
  { value: "less_than_3_months", label: "Less than 3 months" },
  { value: "3_to_6_months", label: "3\u20136 months" },
  { value: "6_to_12_months", label: "6\u201312 months" },
  { value: "1_plus_year", label: "1+ year" },
];

const HOURS_OPTIONS = [
  { value: "5-10", label: "5-10 hours" },
  { value: "10-15", label: "10-15 hours" },
  { value: "15-20", label: "15-20 hours" },
  { value: "20+", label: "20+ hours" },
];


type Step = 0 | 1 | 2; // basic_info, availability_commitments, success
const TOTAL_STEPS = 2;

const STEP_TITLES = [
  "Let\u2019s get to know you",
  "Availability & commitments",
];

/* ─── Reusable Components ──────────────────────────────────── */

function BottomLine({ value, onChange, placeholder, type = "text", onKeyDown, autoFocus }: {
  value: string; onChange: (v: string) => void; placeholder: string;
  type?: string; onKeyDown?: (e: React.KeyboardEvent) => void; autoFocus?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className="w-full border-0 border-b-2 border-gray-200 focus:border-gray-900 outline-none text-lg text-gray-900 placeholder:text-gray-300 py-2 bg-transparent transition-colors"
    />
  );
}

function SearchDropdown({ options, value, onSelect, placeholder = "Type or select an option" }: {
  options: { value: string; label: string }[];
  value: string; onSelect: (v: string) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = search.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const selectedLabel = options.find((o) => o.value === value)?.label;

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 border-0 border-b-2 border-gray-200 focus:border-gray-900 outline-none py-2 text-left transition-colors">
        <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className={`text-lg ${value ? "text-gray-900" : "text-gray-300"}`}>
          {selectedLabel || placeholder}
        </span>
      </button>

      {open && (
        <div className="absolute z-20 mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto animate-in">
          <div className="p-2 border-b border-gray-100">
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..." autoFocus
              className="w-full px-3 py-2 text-sm outline-none bg-gray-50 rounded" />
          </div>
          {filtered.map((opt) => (
            <button key={opt.value} type="button"
              onClick={() => { onSelect(opt.value); setOpen(false); setSearch(""); }}
              className={`w-full text-left px-4 py-3 text-sm transition-colors hover:bg-gray-50 ${
                value === opt.value ? "border-l-2 border-gray-900 font-medium text-gray-900 bg-gray-50" : "text-gray-700"
              }`}>
              {opt.label}
            </button>
          ))}
          {filtered.length === 0 && <p className="px-4 py-3 text-sm text-gray-400">No results</p>}
        </div>
      )}
    </div>
  );
}


/* ─── Main Page ────────────────────────────────────────────── */

export default function MedJobsApplyPage() {
  const [step, setStep] = useState<Step>(0);
  const [animClass, setAnimClass] = useState("tf-visible");
  const [animating, setAnimating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resultSlug, setResultSlug] = useState("");
  const [resultProfileId, setResultProfileId] = useState("");
  const [isExisting, setIsExisting] = useState(false);

  // About You
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [cityQuery, setCityQuery] = useState("");
  const { results: cityResults, preload: preloadCities } = useCitySearch(cityQuery);
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);
  const cityRef = useRef<HTMLDivElement>(null);
  const [university, setUniversity] = useState("");
  const [universityId, setUniversityId] = useState("");
  const [universitySearch, setUniversitySearch] = useState("");
  const [universityOptions, setUniversityOptions] = useState<{ id: string; name: string; city: string; state: string }[]>([]);
  const [universityOther, setUniversityOther] = useState(false);
  const [major, setMajor] = useState("");
  const [majorOther, setMajorOther] = useState("");
  const [intendedSchool, setIntendedSchool] = useState<IntendedProfessionalSchool | "">("");

  // Experience
  const [certifications, setCertifications] = useState<string[]>([]);
  const [yearsCaregiving, setYearsCaregiving] = useState("");
  const [careExperienceTypes, setCareExperienceTypes] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);

  // Availability
  const [availabilityTypes, setAvailabilityTypes] = useState<string[]>([]);
  const [seasonalAvailability, setSeasonalAvailability] = useState<string[]>([]);
  const [durationCommitment, setDurationCommitment] = useState("");
  const [hoursPerWeekRange, setHoursPerWeekRange] = useState("");

  // Confirm — individual attestation checkboxes
  const [attestations, setAttestations] = useState<boolean[]>([false, false, false, false, false, false]);
  const allAcknowledged = attestations.every(Boolean);
  const [honeypot, setHoneypot] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch universities (includes city/state for filtering)
  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    supabase.from("medjobs_universities").select("id, name, city, state").eq("is_active", true).order("name")
      .then(({ data }) => { if (data) setUniversityOptions(data); });
  }, []);

  // Close city dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (cityRef.current && !cityRef.current.contains(e.target as Node)) setCityDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* ─── Navigation ─────────────────────────────────────────── */

  const goTo = useCallback((target: Step) => {
    if (animating || target === step) return;
    setAnimating(true);
    setAnimClass("tf-out");
    setTimeout(() => {
      setStep(target);
      containerRef.current?.scrollTo({ top: 0 });
      window.scrollTo({ top: 0 });
      setAnimClass("tf-in");
      setTimeout(() => { setAnimClass("tf-visible"); setAnimating(false); }, 350);
    }, 200);
  }, [animating, step]);

  // Track partial creation state
  const [partialProfileId, setPartialProfileId] = useState("");
  const [partialSlug, setPartialSlug] = useState("");
  const [partialExisting, setPartialExisting] = useState(false);
  const partialFiredRef = useRef(false);

  const goNext = useCallback(() => {
    if (step < TOTAL_STEPS - 1) {
      // Fire partial creation after step 0 (about_you) completes
      if (step === 0 && !partialFiredRef.current) {
        partialFiredRef.current = true;
        fetch("/api/medjobs/apply-partial", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            displayName, email, phone, city, state,
            website: honeypot,
          }),
        })
          .then((res) => res.json())
          .then(async (data) => {
            if (data.profileId && data.profileId !== "ok") {
              setPartialProfileId(data.profileId);
              setPartialSlug(data.slug || "");
              if (data.existing) setPartialExisting(true);

              // Auto-sign-in: establish browser session silently
              if (data.tokenHash) {
                try {
                  const supabase = createBrowserClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL!,
                    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
                  );
                  await supabase.auth.verifyOtp({
                    token_hash: data.tokenHash,
                    type: "magiclink",
                  });
                } catch {
                  // Non-blocking — sign-in is a nice-to-have during form fill
                }
              }
            }
          })
          .catch(() => {
            // Non-blocking — don't interrupt the user
          });
      }
      goTo((step + 1) as Step);
    }
  }, [step, goTo, displayName, email, phone, city, state, honeypot]);

  const goBack = useCallback(() => {
    if (step > 0) goTo((step - 1) as Step);
  }, [step, goTo]);

  const canAdvance = useCallback((): boolean => {
    if (step === 0) return !!displayName.trim() && !!email.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !!phone.trim();
    if (step === 1) return allAcknowledged;
    return true;
  }, [step, displayName, email, phone, allAcknowledged]);

  /* ─── Submit ─────────────────────────────────────────────── */

  const handleSubmit = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const resolvedMajor = major === "Other" ? majorOther : major;
      const resolvedUniversity = universityOther ? universitySearch : university;
      const res = await fetch("/api/medjobs/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName, email, phone,
          university: resolvedUniversity,
          universityId: universityOther ? undefined : universityId,
          major: resolvedMajor,
          intendedSchool: intendedSchool || undefined,
          city, state, certifications,
          yearsCaregiving: yearsCaregiving || undefined,
          careExperienceTypes, languages, availabilityTypes, seasonalAvailability,
          durationCommitment: durationCommitment || undefined,
          hoursPerWeekRange: hoursPerWeekRange || undefined,
          acknowledgmentsCompleted: true,
          website: honeypot,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); return; }
      setResultSlug(data.slug);
      setResultProfileId(data.profileId);
      setIsExisting(!!data.existing);

      // Auto-sign-in: establish browser session so dashboard works immediately
      if (data.tokenHash) {
        try {
          const supabase = createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
          );
          const { error: otpError } = await supabase.auth.verifyOtp({
            token_hash: data.tokenHash,
            type: "magiclink",
          });
          if (otpError) {
            console.warn("[medjobs/apply] auto-sign-in failed:", otpError.message);
          } else {
            console.log("[medjobs/apply] auto-sign-in succeeded");
          }
        } catch (err) {
          console.warn("[medjobs/apply] auto-sign-in error:", err);
        }
      }

      setStep(2 as Step);
    } catch { setError("Network error. Please try again."); }
    finally { setLoading(false); }
  }, [
    displayName, email, phone, university, universityId, universityOther, universitySearch,
    major, majorOther, intendedSchool, city, state, certifications, yearsCaregiving,
    careExperienceTypes, languages, availabilityTypes, seasonalAvailability,
    durationCommitment, hoursPerWeekRange, honeypot,
  ]);

  /* ─── Success ────────────────────────────────────────────── */

  if (step === 2) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center px-4 py-16">
        <div className="max-w-md w-full">
          {/* Lifecycle bar */}
          <div className="mb-10">
            <LifecycleProgress currentPhase="verify" />
          </div>

          <div className="text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-50 mb-6">
              <svg className="w-10 h-10 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                style={{ animation: "scale-in 0.4s ease-out" }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            {isExisting ? (
              <>
                <h1 className="text-3xl font-semibold text-gray-900 mb-3">Welcome back!</h1>
                <p className="text-gray-500 text-lg mb-8">Pick up where you left off to complete verification and start interviewing.</p>
              </>
            ) : (
              <>
                <h1 className="text-3xl font-semibold text-gray-900 mb-3">You&apos;re in, {displayName.split(" ")[0]}!</h1>
                <p className="text-gray-500 text-lg mb-8">Your application has been submitted. Next step: verify your identity so providers can start reaching out.</p>
              </>
            )}
          </div>

          <div className="text-left mb-10">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-3">To complete verification</p>
            <p className="text-sm text-gray-500 mb-4">We verify every student to protect the families you&apos;ll care for. Once verified, your profile goes live and providers can find you.</p>

            <div className="space-y-3">
              {/* Application — already done */}
              <div className="flex items-start gap-4 p-4 rounded-xl bg-emerald-50/50">
                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-emerald-100 shrink-0">
                  <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-emerald-800">Application submitted</p>
                </div>
              </div>

              {/* Remaining verification steps */}
              {[
                { label: "Record a short intro video", desc: "2\u20133 min \u2014 providers want to see who they\u2019re hiring" },
                { label: "Upload driver\u2019s license", desc: "Verifies your identity \u2014 required for all caregiving roles" },
                { label: "Upload car insurance", desc: "Confirms you can get to assignments safely" },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-4 p-4 rounded-xl bg-gray-50">
                  <div className="flex items-center justify-center w-7 h-7 rounded-full bg-white border-2 border-gray-200 shrink-0">
                    <div className="w-2 h-2 rounded-full bg-gray-300" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.label}</p>
                    <p className="text-xs text-gray-500">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Link href="/portal/medjobs"
            className="inline-flex items-center justify-center w-full px-6 py-3.5 bg-gray-900 hover:bg-gray-800 rounded-lg text-sm font-semibold text-white transition-colors">
            Start Verification
          </Link>
          <style>{`@keyframes scale-in { 0% { transform: scale(0); opacity: 0; } 60% { transform: scale(1.15); } 100% { transform: scale(1); opacity: 1; } }`}</style>
        </div>
      </main>
    );
  }

  /* ─── Progress + Layout ──────────────────────────────────── */

  // University dropdown (special — fetched from Supabase)
  const filteredUniversities = (universityOther ? universitySearch : "").trim()
    ? universityOptions.filter((u) => u.name.toLowerCase().includes(universitySearch.toLowerCase()))
    : universityOptions;

  const UniDropdown = () => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const handler = (e: MouseEvent) => {
        if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
      };
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }, []);

    // Filter universities by selected state, then by search term
    const stateFiltered = state
      ? universityOptions.filter((u) => u.state === state)
      : universityOptions;

    const filtered = search.trim()
      ? stateFiltered.filter((u) => u.name.toLowerCase().includes(search.toLowerCase()))
      : stateFiltered;

    if (universityOther) {
      return (
        <div>
          <BottomLine value={universitySearch} onChange={setUniversitySearch} placeholder="Enter your university name" autoFocus />
          <button type="button" onClick={() => { setUniversityOther(false); setUniversitySearch(""); }}
            className="mt-2 text-xs text-gray-400 hover:text-gray-600">
            Search from list instead
          </button>
        </div>
      );
    }

    return (
      <div ref={ref} className="relative">
        <button type="button" onClick={() => setOpen(!open)}
          className="w-full flex items-center gap-3 border-0 border-b-2 border-gray-200 focus:border-gray-900 outline-none py-2 text-left transition-colors">
          <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span className={`text-lg ${university ? "text-gray-900" : "text-gray-300"}`}>
            {university || "Search your university"}
          </span>
        </button>
        {open && (
          <div className="absolute z-20 mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto animate-in">
            <div className="p-2 border-b border-gray-100">
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..." autoFocus className="w-full px-3 py-2 text-sm outline-none bg-gray-50 rounded" />
            </div>
            {filtered.length > 0 ? filtered.map((u) => (
              <button key={u.id} type="button"
                onClick={() => { setUniversity(u.name); setUniversityId(u.id); setOpen(false); }}
                className={`w-full text-left px-4 py-3 text-sm transition-colors hover:bg-gray-50 ${
                  university === u.name ? "border-l-2 border-gray-900 font-medium text-gray-900 bg-gray-50" : "text-gray-700"
                }`}>
                {u.name} <span className="text-gray-400">({u.city})</span>
              </button>
            )) : (
              <p className="px-4 py-3 text-sm text-gray-400">
                {state ? `No universities found in ${state}` : "No universities found"}
              </p>
            )}
            <button type="button" onClick={() => { setUniversityOther(true); setOpen(false); }}
              className="w-full text-left px-4 py-3 text-sm text-gray-500 font-medium hover:bg-gray-50 border-t border-gray-100">
              My school isn&apos;t listed
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-white">
      {/* Honeypot */}
      <div className="absolute -left-[9999px]" aria-hidden="true">
        <input type="text" name="website" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} tabIndex={-1} autoComplete="off" />
      </div>

      <div ref={containerRef} className="max-w-xl mx-auto px-4 sm:px-6 pt-14 pb-40">
        {/* Lifecycle progress bar */}
        <div className="mb-6">
          <LifecycleProgress currentPhase="apply" />
        </div>

        {/* Animated content */}
        <div className={`tf-container ${animClass}`}>
          {/* Section header */}
          <div className="mb-8 pt-4">
            <h1 className="text-2xl font-semibold text-gray-900">{STEP_TITLES[step]}</h1>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 rounded-lg text-sm text-red-700">{error}</div>
          )}

          {/* ── Step 0: About You ── */}
          {step === 0 && (
            <div className="space-y-7">
              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">Full name *</label>
                <BottomLine value={displayName} onChange={setDisplayName} placeholder="Sarah Kim" autoFocus />
              </div>
              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">Email *</label>
                <BottomLine value={email} onChange={setEmail} placeholder="sarah@university.edu" type="email" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">Phone *</label>
                <BottomLine value={phone} onChange={setPhone} placeholder="(555) 123-4567" type="tel" />
              </div>

              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">School Location</label>
                <div ref={cityRef} className="relative">
                  <div className="w-full flex items-center gap-3 border-0 border-b-2 border-gray-200 focus-within:border-gray-900 py-2 transition-colors">
                    <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      value={city && state ? `${city}, ${state}` : cityQuery}
                      onChange={(e) => {
                        setCityQuery(e.target.value);
                        setCity("");
                        setState("");
                        setCityDropdownOpen(true);
                      }}
                      onFocus={() => { preloadCities(); setCityDropdownOpen(true); }}
                      placeholder="City where your school is located"
                      className="w-full text-lg text-gray-900 placeholder:text-gray-300 bg-transparent outline-none"
                    />
                    {city && (
                      <button type="button" onClick={() => { setCity(""); setState(""); setCityQuery(""); }}
                        className="text-gray-300 hover:text-gray-500 shrink-0">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  {cityDropdownOpen && cityQuery.length >= 2 && !city && (
                    <div className="absolute z-20 mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                      {cityResults.length > 0 ? cityResults.map((r) => (
                        <button key={r.full} type="button"
                          onClick={() => { setCity(r.city); setState(r.state); setCityQuery(""); setCityDropdownOpen(false); }}
                          className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                          {r.full}
                        </button>
                      )) : (
                        <p className="px-4 py-3 text-sm text-gray-400">No cities found</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-gray-100 pt-7">
                <label className="block text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">University</label>
                <UniDropdown />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">Major</label>
                  <SearchDropdown
                    options={MAJORS.map((m) => ({ value: m, label: m }))}
                    value={major} onSelect={setMajor} placeholder="Select" />
                  {major === "Other" && (
                    <div className="mt-3">
                      <BottomLine value={majorOther} onChange={setMajorOther} placeholder="Enter your major" />
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">Career path</label>
                  <SearchDropdown
                    options={INTENDED_SCHOOLS.map((s) => ({ value: s.value, label: s.label }))}
                    value={intendedSchool} onSelect={(v) => setIntendedSchool(v as IntendedProfessionalSchool)} placeholder="Select" />
                </div>
              </div>
            </div>
          )}

          {/* ── Step 1: Availability & Commitments ── */}
          {step === 1 && (
            <div className="space-y-6">
              <p className="text-sm text-gray-500 leading-relaxed">
                Students in this program are expected to be available for shifts between classes, evenings, weekends, and overnights. We work around your class schedule and exam periods.
              </p>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">Hours per week</label>
                  <SearchDropdown options={HOURS_OPTIONS} value={hoursPerWeekRange} onSelect={setHoursPerWeekRange} placeholder="Select" />
                  <ReactiveHint show={!!hoursPerWeekRange && ["5-10", "10-15"].includes(hoursPerWeekRange)}>
                    Students who commit 15+ hrs/week are more competitive with providers.
                  </ReactiveHint>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">How long can you commit?</label>
                  <SearchDropdown options={DURATION_OPTIONS} value={durationCommitment} onSelect={setDurationCommitment} placeholder="Select" />
                  <ReactiveHint show={durationCommitment === "less_than_3_months" || durationCommitment === "3_to_6_months"}>
                    Providers strongly prefer 6+ month commitments.
                  </ReactiveHint>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-5">
                <p className="text-sm text-gray-500 leading-relaxed mb-3">
                  These standards are why providers trust MedJobs students. If these feel right to you, you&apos;re exactly who we&apos;re looking for.
              </p>

              {[
                "I\u2019ll be on time, professional, and communicate schedule changes 24+ hours in advance",
                "I understand caregiving duties include personal care, meals, mobility, and companionship",
                "I have reliable transportation and accept responsibility for my transport costs",
                "I consent to a background check and drug test upon hire",
                "I\u2019ll respond to interview requests within 48 hours",
                "All information in this application is accurate and Olera is not the employer of record",
              ].map((item, i) => (
                <button key={i} type="button"
                  onClick={() => setAttestations((prev) => { const next = [...prev]; next[i] = !next[i]; return next; })}
                  className={`w-full flex items-start gap-3 px-4 py-3.5 rounded-lg text-left transition-all ${
                    attestations[i] ? "border-2 border-gray-900 bg-gray-50" : "border border-gray-200 hover:border-gray-300"
                  }`}>
                  <span className={`inline-flex items-center justify-center w-5 h-5 rounded border-2 shrink-0 mt-0.5 transition-colors ${
                    attestations[i] ? "bg-gray-900 border-gray-900 text-white" : "border-gray-300"
                  }`}>
                    {attestations[i] && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                  </span>
                  <span className="text-sm text-gray-700 leading-relaxed">{item}</span>
                </button>
              ))}

              <ReactiveHint show={allAcknowledged}>
                You&apos;re ready. Students who meet these standards are highly sought after by providers and gain clinical experience that strengthens professional school applications.
              </ReactiveHint>
              </div>
            </div>
          )}

          {/* ── Navigation ── */}
          <div className="mt-10 flex items-center justify-between">
            {step > 0 ? (
              <button type="button" onClick={goBack} className="text-sm text-gray-300 hover:text-gray-500 transition-colors">
                &larr; Back
              </button>
            ) : <div />}

            {step === 1 ? (
              <button type="button" onClick={handleSubmit}
                disabled={loading || !allAcknowledged}
                className="inline-flex items-center gap-2 px-8 py-3 bg-gray-900 hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg text-sm font-semibold text-white transition-colors">
                {loading ? "Submitting..." : "Submit application"}
              </button>
            ) : (
              <button type="button" onClick={goNext}
                disabled={!canAdvance() || animating}
                className="inline-flex items-center gap-2 px-8 py-3 bg-gray-900 hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg text-sm font-semibold text-white transition-colors">
                OK
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Bottom nav arrows */}
      <div className="fixed bottom-6 right-6 flex items-center gap-1 z-30">
        <button type="button" onClick={goBack} disabled={step === 0}
          className="p-2 bg-white border border-gray-200 rounded-l-lg hover:bg-gray-50 disabled:opacity-30 transition-colors">
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
        <button type="button" onClick={goNext} disabled={step >= TOTAL_STEPS - 1 || !canAdvance()}
          className="p-2 bg-white border border-gray-200 rounded-r-lg hover:bg-gray-50 disabled:opacity-30 transition-colors">
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      <style>{`
        .tf-container { transition: opacity 0.2s ease, transform 0.3s ease; }
        .tf-visible { opacity: 1; transform: translateY(0); }
        .tf-out { opacity: 0; transform: translateY(-12px); }
        .tf-in { opacity: 0; transform: translateY(16px); animation: tf-slide-in 0.35s ease forwards; }
        @keyframes tf-slide-in { to { opacity: 1; transform: translateY(0); } }
        .animate-in { animation: tf-slide-in 0.2s ease forwards; opacity: 0; transform: translateY(8px); }
      `}</style>
    </main>
  );
}

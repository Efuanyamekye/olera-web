"use client";

import { useState } from "react";
import Image from "next/image";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import type { IntendedProfessionalSchool } from "@/lib/types";
import type { CoverageBucket } from "@/lib/medjobs/student-eligibility";
import { PARTNER_UNIVERSITIES } from "@/lib/staffing-outreach/partner-universities";

/**
 * StudentEligibilityModal — the student funnel front door (mirror of the
 * provider EligibilityScreenerModal).
 *
 * Q1 aspiration → Q2 availability → email → silent sign-in (one modal, no
 * redirect). Two baby-step questions, both self-affirming; the email lands as
 * the reward. Writes eligibility + creates the account via
 * /api/medjobs/student-eligibility, then verifyOtp establishes the session so
 * AuthProvider's listener fires and the board re-renders authed in place.
 */

type Step = "q1" | "q2" | "email" | "loading";

const Q1: { value: IntendedProfessionalSchool; label: string; reassure: string }[] = [
  { value: "medicine", label: "Med school", reassure: "Perfect — paid caregiving hours are exactly what med schools want to see." },
  { value: "nursing", label: "Nursing", reassure: "Perfect — nursing programs love real bedside hours." },
  { value: "pa", label: "PA", reassure: "Perfect — PA programs want direct patient-care hours, and this counts." },
  { value: "pt", label: "PT / OT", reassure: "Great — hands-on care hours strengthen PT/OT applications." },
  { value: "public_health", label: "Public health", reassure: "Great — frontline care experience grounds a public-health path." },
  { value: "undecided", label: "Still exploring", reassure: "Love it — this is the best way to find out if healthcare's for you." },
];

const Q2: { value: CoverageBucket; label: string }[] = [
  { value: "day", label: "Days" },
  { value: "evening", label: "Evenings" },
  { value: "overnight", label: "Overnights" },
  { value: "weekend", label: "Weekends" },
];

const btnPrimary =
  "mt-2 w-full rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-40";
const optionClass =
  "w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-left text-sm font-medium text-gray-800 hover:border-primary-300 hover:bg-primary-50/40";
const fieldClass =
  "w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-base placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-transparent";

const EMAIL_RE = /\S+@\S+\.\S+/;

export interface StudentEligibilityContext {
  campusName?: string | null;
  campusSlug?: string | null;
  universityName?: string | null;
  universityId?: string | null;
  city?: string | null;
  state?: string | null;
  /** Live catchment count for the demand line; honest floor applied below. */
  demandCount?: number | null;
  referral?: unknown;
}

export default function StudentEligibilityModal({
  context,
  onClose,
  onComplete,
  onExistingUser,
}: {
  context: StudentEligibilityContext;
  onClose: () => void;
  onComplete: () => void | Promise<void>;
  /** Called when the user already has an account — parent should open auth flow */
  onExistingUser?: (email: string) => void;
}) {
  const { refreshAccountData } = useAuth();
  const [step, setStep] = useState<Step>("q1");
  const [track, setTrack] = useState<IntendedProfessionalSchool | null>(null);
  const [buckets, setBuckets] = useState<CoverageBucket[]>([]);
  const [email, setEmail] = useState("");
  const [university, setUniversity] = useState<string>(context.campusSlug ?? "");
  const [honeypot, setHoneypot] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState(false);

  const reassurance = Q1.find((q) => q.value === track)?.reassure;

  const toggleBucket = (b: CoverageBucket) =>
    setBuckets((cur) => (cur.includes(b) ? cur.filter((x) => x !== b) : [...cur, b]));

  async function submit() {
    if (!university) {
      setError("Please select your university.");
      return;
    }
    if (!EMAIL_RE.test(email)) {
      setError("Please enter a valid email.");
      return;
    }
    setError(null);
    setStep("loading");
    try {
      const selectedUni = PARTNER_UNIVERSITIES.find((u) => u.slug === university);
      const res = await fetch("/api/medjobs/student-eligibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          careerPath: track,
          coverageBuckets: buckets,
          university: selectedUni?.name ?? context.universityName ?? undefined,
          universityId: context.universityId ?? undefined,
          campus: university,
          city: context.city ?? undefined,
          state: context.state ?? undefined,
          referral: context.referral,
          website: honeypot,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setStep("email");
        return;
      }

      if (data.existing) {
        // Returning student — close screener and open auth flow so they can sign in
        if (onExistingUser) {
          onExistingUser(email.trim());
          return;
        }
        // Fallback: show "Welcome back" if no handler provided
        setExisting(true);
        return;
      }

      if (data.tokenHash) {
        const supabase = createClient();
        const { error: otpError } = await supabase.auth.verifyOtp({
          token_hash: data.tokenHash,
          type: "magiclink",
        });
        if (otpError) {
          console.warn("[student-eligibility] auto-sign-in failed:", otpError.message);
        }
      }
      await refreshAccountData();
      await onComplete();
    } catch {
      setError("Network error. Please try again.");
      setStep("email");
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="relative w-full max-w-md rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>

        {context.campusName ? (
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary-600">
            {context.campusName} · Student Caregiver Program
          </p>
        ) : null}

        {/* Honeypot */}
        <input
          type="text"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          className="hidden"
          tabIndex={-1}
          autoComplete="off"
        />

        {existing ? (
          <div>
            <p className="font-serif text-lg text-gray-900">Welcome back!</p>
            <p className="mt-1 text-sm text-gray-700">
              You already have an account. We just emailed you a sign-in link — open it to pick up
              where you left off.
            </p>
            <button type="button" onClick={onClose} className={btnPrimary}>
              Got it
            </button>
          </div>
        ) : step === "q1" ? (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary-600">
              Eligibility check · 2 quick questions
            </p>
            <p className="font-serif text-lg text-gray-900">Where are you headed?</p>
            <p className="mt-1 text-sm text-gray-500">A quick check to match you to the right families and agencies for your hours.</p>
            <div className="mt-4 grid gap-2">
              {Q1.map((q) => (
                <button
                  key={q.value}
                  type="button"
                  className={optionClass}
                  onClick={() => {
                    setTrack(q.value);
                    setStep("q2");
                  }}
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        ) : step === "q2" ? (
          <div>
            {reassurance ? (
              <p className="mb-3 rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-800">
                {reassurance}
              </p>
            ) : null}
            <p className="font-serif text-lg text-gray-900">When are you usually free?</p>
            <p className="mt-1 text-sm text-gray-500">Pick all that apply — we build shifts around your classes.</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {Q2.map((b) => {
                const on = buckets.includes(b.value);
                return (
                  <button
                    key={b.value}
                    type="button"
                    onClick={() => toggleBucket(b.value)}
                    className={
                      "rounded-xl border px-4 py-3 text-sm font-medium " +
                      (on
                        ? "border-primary-500 bg-primary-50 text-primary-800"
                        : "border-gray-200 bg-white text-gray-800 hover:border-primary-300")
                    }
                  >
                    {b.label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              disabled={buckets.length === 0}
              className={btnPrimary}
              onClick={() => setStep("email")}
            >
              Continue →
            </button>
          </div>
        ) : step === "email" ? (
          <div>
            <div className="flex items-start gap-3">
              <Image
                src="/images/for-providers/team/logan.jpg"
                alt="Dr. Logan DuBose"
                width={40}
                height={40}
                className="h-10 w-10 shrink-0 rounded-full object-cover shadow-sm"
              />
              <div>
                <p className="font-serif text-lg text-gray-900">You&apos;re a good fit!</p>
                <p className="mt-1 text-sm text-gray-700">
                  Complete the full application to get hired for caregiving jobs near campus.
                </p>
              </div>
            </div>
            <p className="mt-3 text-sm font-medium text-gray-800">Your university:</p>
            <select
              value={university}
              onChange={(e) => {
                setUniversity(e.target.value);
                if (error) setError(null);
              }}
              className={fieldClass + " mt-2"}
            >
              <option value="">Select your university</option>
              {PARTNER_UNIVERSITIES.map((u) => (
                <option key={u.slug} value={u.slug}>
                  {u.name}
                </option>
              ))}
            </select>
            <p className="mt-3 text-sm font-medium text-gray-800">Add your email to get started:</p>
            <input
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="you@school.edu"
              className={fieldClass + " mt-2"}
            />
            {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
            <button
              type="button"
              disabled={!university || !email.trim()}
              className={btnPrimary + " disabled:opacity-50"}
              onClick={submit}
            >
              Go to full application →
            </button>
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-gray-500">Setting up your account…</div>
        )}
      </div>
    </div>
  );
}

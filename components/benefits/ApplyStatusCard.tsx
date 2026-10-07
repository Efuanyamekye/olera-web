"use client";

import { useState } from "react";

/**
 * On the saved plan (/m/{token}) once the family has told us they sent Social
 * Security's Extra Help form through the apply-along: one tap says what came
 * back. The check-in texts and emails link here; a tap (not a page load)
 * records it, so a mail scanner opening the link records nothing.
 */
type Decision = "approved" | "waiting" | "denied" | "stuck";

const CHOICES: { value: Decision; label: string }[] = [
  { value: "approved", label: "Approved" },
  { value: "waiting", label: "Still waiting" },
  { value: "denied", label: "They said no" },
  { value: "stuck", label: "Something's stuck" },
];

const AFTER: Record<Decision, string> = {
  approved: "Wonderful. If Medicare Savings was approved, the Part B premium should stop coming out of the Social Security payment within a couple of months. If it doesn't, tell us.",
  waiting: "Thanks. States have up to 45 days to decide on Medicare Savings. We'll check in again.",
  denied: "We're sorry. A no can often be appealed, and there may be another program that fits. A person on our team will be in touch.",
  stuck: "Got it. A person on our team will text or email you, usually within 2 business days.",
};

export default function ApplyStatusCard({ token, appliedAt, initial }: { token: string; appliedAt: string; initial: Decision | null }) {
  const [decision, setDecision] = useState<Decision | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sent = new Date(appliedAt).toLocaleDateString("en-US", { month: "long", day: "numeric" });

  const choose = async (value: Decision) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/families/benefits-journey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: "decision", value }),
      });
      if (!res.ok) throw new Error("We couldn't save that just now. Please try again.");
      setDecision(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't save that just now.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5" aria-label="Your Extra Help application">
      <p className="m-0 text-[13px] font-semibold text-primary-700">Sent {sent}</p>
      <h2 className="mt-1 mb-0 font-display text-[22px] leading-snug text-gray-900">
        {decision && decision !== "waiting" ? "Thanks for telling us" : "Your Extra Help and Medicare Savings application"}
      </h2>
      {decision ? (
        <p className="mt-2 mb-0 text-[15px] leading-relaxed text-gray-700">{AFTER[decision]}</p>
      ) : (
        <>
          <p className="mt-2 mb-0 text-[15px] text-gray-600">What&apos;s come back so far?</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {CHOICES.map((c) => (
              <button
                key={c.value}
                type="button"
                disabled={busy}
                onClick={() => void choose(c.value)}
                className="min-h-[48px] rounded-xl border border-gray-300 bg-white px-3 text-[15px] font-semibold text-gray-900 cursor-pointer disabled:opacity-60"
              >
                {c.label}
              </button>
            ))}
          </div>
        </>
      )}
      {decision === "waiting" ? (
        <button type="button" onClick={() => setDecision(null)} className="mt-2 bg-transparent border-none p-0 text-[14px] text-gray-500 cursor-pointer">
          Something changed?
        </button>
      ) : null}
      {error ? <p role="alert" className="mt-2 mb-0 text-[14px] text-red-700">{error}</p> : null}
    </section>
  );
}

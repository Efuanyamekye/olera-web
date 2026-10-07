"use client";

import { useEffect, useRef, useState } from "react";
import { SSA_EXTRA_HELP_URL, SSA_PHONE, type ApplyAlong, type ApplyHousehold } from "@/lib/benefits/apply-along";
import { incomeRangeFromFinder, relationshipFromFinder, type FinderIncome, type FinderWho } from "@/lib/benefits/finder-answers";
import { telHref } from "@/lib/benefits/call-script";
import { trackBenefitsEvent } from "@/lib/analytics/track-step";
import { getOrCreateSessionId, getOrCreateVisitId } from "@/lib/analytics/session";

/**
 * The apply-along sheet (lib/benefits/apply-along.ts): Social Security's
 * Extra Help form, section by section, with the family's answers filled in.
 * They submit on Social Security's site; here they tell us they did, so the
 * check-ins can ask what came back. A plan token records it on the family;
 * without one, they give a number or email first (the plan save).
 */

interface Props {
  sheet: ApplyAlong;
  token: string | null;
  stateCode: string | null;
  stateSlug: string | null;
  program: { id: string; name: string; shortName: string | null } | null;
  who: FinderWho | null;
  household: ApplyHousehold;
  income: string | null;
}

const TRACKING_KEY = "benefits-finder";
const VARIANT = "apply_along_v1";
const FINDER_KEY = "olera-finder-v2";

type Phase = "sheet" | "contact" | "done";

export default function ApplyAlongView({ sheet, token, stateCode, stateSlug, program, who, household, income }: Props) {
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("sheet");
  // What the contact form is for: recording a submission, or sending the sheet for later.
  const [purpose, setPurpose] = useState<"applied" | "later">("applied");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedTo, setSavedTo] = useState<"sms" | "email" | null>(token ? "sms" : null);
  const entryTracked = useRef(false);

  const track = (event: "benefits_entry_viewed" | "benefits_step_completed", stepName: string) =>
    trackBenefitsEvent({
      event,
      sessionId: getOrCreateSessionId(),
      stateCode,
      stateName: null,
      providerName: null,
      providerSlug: TRACKING_KEY,
      variant: VARIANT,
      stepName,
      stepNumber: 0,
      entrySource: "/benefits/apply/extra-help",
    });

  useEffect(() => {
    if (entryTracked.current) return;
    entryTracked.current = true;
    track("benefits_entry_viewed", "entry");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recordApplied = async (t: string) => {
    const res = await fetch("/api/families/benefits-journey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: t, action: "applied", programId: program?.id, stateId: stateSlug }),
    });
    if (!res.ok) throw new Error("We couldn't save that just now. Please try again.");
  };

  const submitted = async () => {
    track("benefits_step_completed", "applied");
    setError(null);
    if (!token) {
      // Nothing to record it on yet: ask where to check in.
      setPurpose("applied");
      setPhase("contact");
      return;
    }
    setBusy(true);
    try {
      await recordApplied(token);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't save that just now.");
    } finally {
      setBusy(false);
    }
  };

  /** The plan save: creates the family's record and texts or emails the plan. */
  const save = async () => {
    const value = contact.trim();
    const isEmail = value.includes("@");
    if (!isEmail && value.replace(/\D/g, "").length < 10) {
      setError("Enter a 10-digit mobile number or an email address.");
      return;
    }
    if (!program || !stateCode || !stateSlug) {
      setError("We couldn't tell which state this is for. Go back to your plan and try again.");
      return;
    }
    setBusy(true);
    setError(null);
    // The family's whole plan, when this browser still holds it, so their saved
    // plan isn't cut down to this one program.
    let planIds: string[] = [];
    try {
      const saved = JSON.parse(localStorage.getItem(FINDER_KEY) || "null");
      const r = saved?.result;
      if (r && r.stateCode === stateCode) planIds = [r.firstStep, ...(r.programs || [])].filter((p: { id?: string } | null) => p?.id && p.id !== "local-agency").map((p: { id: string }) => p.id);
    } catch {
      // No saved plan in this browser.
    }
    const ids = [program.id, ...planIds.filter((id) => id !== program.id)].slice(0, 30);
    try {
      const res = await fetch("/api/benefits/save-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          careNeed: "payingForCare",
          careNeedSource: "stated",
          incomeRange: incomeRangeFromFinder(income as FinderIncome | null),
          stateCode,
          contactChannel: isEmail ? "email" : "sms",
          email: isEmail ? value : undefined,
          phone: isEmail ? undefined : value,
          relationship: relationshipFromFinder(who),
          householdSize: household === "alone" ? "1" : household === "couple" ? "2" : household === "family" ? "3" : undefined,
          entrySource: "/benefits/apply/extra-help",
          sessionId: getOrCreateSessionId(),
          visitId: getOrCreateVisitId(),
          matchedPrograms: [{ programId: program.id, stateId: stateSlug, name: program.name, shortName: program.shortName ?? undefined, programType: "benefit" }],
          matchCount: ids.length,
          firstStepProgramId: program.id,
          finderProgramIds: ids,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "We couldn't save that just now. Please try again.");
      // A returning family's record isn't changed from an unverified browser;
      // their plan still goes to what's on file.
      if (purpose === "applied" && body.token) await recordApplied(body.token);
      track("benefits_step_completed", purpose === "applied" ? "applied_saved" : "saved_for_later");
      setSavedTo(isEmail ? "email" : "sms");
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't save that just now.");
    } finally {
      setBusy(false);
    }
  };

  if (phase === "done") {
    return (
      <div className="conv-rise flex flex-col gap-6">
        <style>{`@keyframes convRise { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } } .conv-rise { animation: convRise .32s cubic-bezier(.16,1,.3,1) both } @media (prefers-reduced-motion: reduce) { .conv-rise { animation: none } }`}</style>
        <h1 className="font-display text-[32px] leading-[1.08] text-gray-900 m-0">
          {purpose === "later" ? "Sent. It's there when you're ready." : "Done. Here's what happens next."}
        </h1>
        {purpose === "later" ? (
          <p className="m-0 text-[17px] text-gray-700">
            Open the link {savedTo === "email" ? "in the email" : "in the text"} when you&apos;re together. Your answers will be filled in.
          </p>
        ) : (
          <ul className="m-0 pl-5 flex flex-col gap-2.5 text-[17px] text-gray-700">
            {sheet.next.map((n) => <li key={n}>{n}</li>)}
          </ul>
        )}
        {savedTo && purpose === "applied" ? (
          <p className="m-0 text-[15px] text-gray-600">
            We&apos;ll check in by {savedTo === "email" ? "email" : "text"} in about a week to see what came in the mail. A person on our team reads every reply.
          </p>
        ) : null}
      </div>
    );
  }

  if (phase === "contact") {
    return (
      <div className="flex flex-col gap-5">
        <button type="button" onClick={() => setPhase("sheet")} className="self-start bg-transparent border-none p-0 text-[14px] text-gray-600 font-medium cursor-pointer">← Back</button>
        <h1 className="font-display text-[30px] leading-[1.1] text-gray-900 m-0">
          {purpose === "applied" ? "Where should we check in?" : "Where should we send it?"}
        </h1>
        <p className="m-0 text-[16px] text-gray-600">
          {purpose === "applied"
            ? "We'll ask in about a week whether a letter came, and help if something's stuck."
            : "A link that opens this list with your answers filled in, for when you're together."}
        </p>
        <input
          type="text"
          inputMode="email"
          autoComplete="tel"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="Mobile number or email"
          className="min-h-[56px] rounded-2xl border border-gray-300 bg-white px-4 text-[17px] text-gray-900"
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="min-h-[56px] rounded-2xl bg-primary-800 text-white text-[17px] font-semibold border-none cursor-pointer disabled:opacity-60"
        >
          {busy ? "Saving…" : purpose === "applied" ? "Check in with me" : "Send it"}
        </button>
        {purpose === "applied" ? (
          <button type="button" onClick={() => setPhase("done")} className="self-start bg-transparent border-none p-0 text-[15px] text-gray-500 cursor-pointer">
            Skip
          </button>
        ) : null}
        {error ? <p role="alert" className="m-0 text-[15px] text-red-700">{error}</p> : null}
        <p className="m-0 text-[13px] text-gray-500">By texting you agree to messages from Olera about this application. Reply STOP to stop.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col gap-3">
        <span className="text-[13px] font-semibold text-primary-700">Start here</span>
        <h1 className="font-display text-[32px] leading-[1.08] text-gray-900 m-0">{sheet.heading}</h1>
        <p className="m-0 text-[17px] text-gray-700">{sheet.lede}</p>
      </header>

      <section className="flex flex-col">
        <h2 className="text-[15px] font-semibold text-gray-900 m-0 mb-1">Have these ready</h2>
        {sheet.gather.map((g, i) => (
          <label key={g} className="flex items-start gap-3 py-3 border-t border-gray-200 cursor-pointer">
            <input
              type="checkbox"
              checked={ticked.has(i)}
              onChange={() => setTicked((t) => { const n = new Set(t); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
              className="mt-1 w-5 h-5 accent-primary-700"
            />
            <span className="text-[16px] text-gray-800">{g}</span>
          </label>
        ))}
      </section>

      <div className="flex flex-col gap-3">
        <a
          href={SSA_EXTRA_HELP_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track("benefits_step_completed", "ssa_opened")}
          className="min-h-[56px] rounded-2xl bg-primary-800 text-white text-[17px] font-semibold flex items-center justify-center no-underline"
        >
          Open Social Security&apos;s application
        </a>
        <p className="m-0 text-[14px] text-gray-500 text-center">It opens in a new tab. Keep this one open beside it.</p>
        {program ? (
          <button
            type="button"
            onClick={() => { setPurpose("later"); setPhase("contact"); setError(null); track("benefits_step_completed", "later"); }}
            className="bg-transparent border-none p-0 text-[15px] font-semibold text-primary-800 cursor-pointer"
          >
            Not together right now? Send me this for later
          </button>
        ) : null}
      </div>

      <section className="flex flex-col">
        <h2 className="text-[15px] font-semibold text-gray-900 m-0 mb-1">What to put, screen by screen</h2>
        <ol className="m-0 p-0 list-none">
          {sheet.steps.map((s, i) => (
            <li key={s.title} className={`py-4 border-t border-gray-200 ${s.key ? "pl-3 border-l-[3px] border-l-primary-600" : ""}`}>
              <p className="m-0 text-[13px] font-semibold text-gray-500">{i + 1}. {s.title}</p>
              <p className={`m-0 mt-1 text-[17px] ${s.key ? "font-semibold text-gray-900" : "text-gray-900"}`}>{s.answer}</p>
              {s.note ? <p className="m-0 mt-1 text-[15px] text-gray-600">{s.note}</p> : null}
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col border-t border-gray-200">
        <button type="button" onClick={() => { setPhoneOpen(!phoneOpen); if (!phoneOpen) track("benefits_step_completed", "phone_opened"); }} aria-expanded={phoneOpen} className="w-full flex justify-between items-center bg-transparent border-none px-0 py-3 text-[15px] text-gray-900 font-medium cursor-pointer text-left">
          <span>Rather do it by phone?</span>
          <span className="text-gray-400" aria-hidden="true">{phoneOpen ? "−" : "+"}</span>
        </button>
        {phoneOpen ? (
          <div className="pb-3 flex flex-col gap-2">
            <a href={telHref(SSA_PHONE)} className="text-[17px] font-semibold text-primary-800 no-underline">Call Social Security, {SSA_PHONE}</a>
            <p className="m-0 text-[15px] text-gray-700">&ldquo;{sheet.phoneScript}&rdquo;</p>
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-3 border-t border-gray-200 pt-5">
        <h2 className="font-display text-[24px] text-gray-900 m-0">Sent it?</h2>
        <p className="m-0 text-[16px] text-gray-600">Tell us, and we&apos;ll follow it with you until there&apos;s an answer.</p>
        <button
          type="button"
          onClick={() => void submitted()}
          disabled={busy}
          className="min-h-[56px] rounded-2xl border-[1.5px] border-primary-800 bg-white text-primary-800 text-[17px] font-semibold cursor-pointer disabled:opacity-60"
        >
          {busy ? "Saving…" : "Yes, we submitted it"}
        </button>
        {error ? <p role="alert" className="m-0 text-[15px] text-red-700">{error}</p> : null}
      </section>
    </div>
  );
}

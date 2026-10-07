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
  // The quiet links under the steps: every screen, or the phone route.
  const [more, setMore] = useState<"screens" | "phone" | null>(null);
  const [phase, setPhase] = useState<Phase>("sheet");
  // What the contact form is for: recording a submission, or sending the sheet for later.
  const [purpose, setPurpose] = useState<"applied" | "later">("applied");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedTo, setSavedTo] = useState<"sms" | "email" | null>(null);
  // True once the submission is on the family's record, which is what the
  // check-ins read. A returning family saved from this browser isn't (their
  // record isn't changed from an unverified browser), so no check-in promise.
  const [recorded, setRecorded] = useState(false);
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
      setRecorded(true);
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
      if (purpose === "applied" && body.token) {
        await recordApplied(body.token);
        setRecorded(true);
      }
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
        {recorded && purpose === "applied" ? (
          <p className="m-0 text-[15px] text-gray-600">
            We&apos;ll check in{savedTo ? ` by ${savedTo === "email" ? "email" : "text"}` : ""} in about a week to see what came in the mail. A person on our team reads every reply.
          </p>
        ) : purpose === "applied" && savedTo ? (
          <p className="m-0 text-[15px] text-gray-600">
            Your plan is on its way. When something comes in the mail, open it and tap what happened.
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

  const Obj = ({ name, size = 40 }: { name: string; size?: number }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/images/apply-along/${name}.svg`} alt="" width={size} height={size} style={{ width: size, height: size }} className="shrink-0" />
  );
  const Num = ({ n }: { n: number }) => (
    <span aria-hidden="true" className="mt-0.5 w-[26px] h-[26px] shrink-0 rounded-full border-[1.5px] border-primary-700 text-primary-700 text-[13px] font-bold grid place-items-center">{n}</span>
  );

  return (
    <div className="flex flex-col gap-9">
      <header className="flex flex-col gap-2.5">
        <span className="text-[13px] font-semibold text-primary-700">{sheet.eyebrow}</span>
        <h1 className="text-[28px] sm:text-[32px] font-bold tracking-[-0.01em] leading-[1.15] text-gray-900 m-0 [text-wrap:balance]">{sheet.heading}</h1>
        <p className="m-0 text-[17px] text-gray-600">{sheet.lede}</p>
      </header>

      <section className="flex flex-col gap-7" aria-label="How it works">
        <h2 className="m-0 text-[15px] font-semibold text-gray-500">How it works</h2>

        <div className="flex gap-3">
          <Num n={1} />
          <div className="flex flex-col gap-3 min-w-0 flex-1">
            <p className="m-0 text-[18px] font-semibold text-gray-900">Open Social Security&apos;s form</p>
            <p className="m-0 text-[16px] text-gray-600">{sheet.formLine}</p>
            <div className="flex items-center gap-3 text-[15px] text-gray-600"><Obj name="id-card" size={32} />{sheet.gatherLine}</div>
            <a
              href={SSA_EXTRA_HELP_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track("benefits_step_completed", "ssa_opened")}
              className="min-h-[56px] rounded-2xl bg-primary-800 text-white text-[17px] font-semibold flex items-center justify-center no-underline"
            >
              Open the Social Security form
            </a>
          </div>
        </div>

        <div className="flex gap-3">
          <Num n={2} />
          <div className="flex flex-col min-w-0 flex-1">
            <p className="m-0 text-[18px] font-semibold text-gray-900">Answer its questions</p>
            <p className="m-0 mt-2 mb-1 text-[16px] text-gray-600">Three of them are about money. Here&apos;s what you told us, to check against:</p>
            {sheet.money.map((r) => (
              <div key={r.title} className="grid grid-cols-[40px_1fr] gap-3.5 py-3.5 border-t border-gray-200 first-of-type:border-t-0 items-start">
                <Obj name={r.icon} />
                <div className="min-w-0">
                  <p className={`m-0 text-[17px] font-semibold ${r.icon === "check-mark" ? "text-primary-800" : "text-gray-900"}`}>{r.title}</p>
                  <p className="m-0 mt-0.5 text-[15px] text-gray-600">{r.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <Num n={3} />
          <div className="flex flex-col gap-3 min-w-0 flex-1">
            <p className="m-0 text-[18px] font-semibold text-gray-900">Send it, then tell us</p>
            <p className="m-0 text-[16px] text-gray-600">We&apos;ll check in by text or email after about a week, and again after about five.</p>
            <button
              type="button"
              onClick={() => void submitted()}
              disabled={busy}
              className="self-start min-h-[48px] px-6 rounded-full border-[1.5px] border-primary-800 bg-white text-primary-800 text-[16px] font-semibold cursor-pointer disabled:opacity-60"
            >
              {busy ? "Saving…" : "We sent it"}
            </button>
            {error ? <p role="alert" className="m-0 text-[15px] text-red-700">{error}</p> : null}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3 border-t border-gray-200 pt-5">
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-[15px] font-medium">
          <button type="button" onClick={() => setMore(more === "screens" ? null : "screens")} aria-expanded={more === "screens"} className="bg-transparent border-none p-0 text-primary-800 cursor-pointer">See every screen</button>
          <button type="button" onClick={() => { setMore(more === "phone" ? null : "phone"); if (more !== "phone") track("benefits_step_completed", "phone_opened"); }} aria-expanded={more === "phone"} className="bg-transparent border-none p-0 text-primary-800 cursor-pointer">Rather call?</button>
          {program ? (
            <button type="button" onClick={() => { setPurpose("later"); setPhase("contact"); setError(null); track("benefits_step_completed", "later"); }} className="bg-transparent border-none p-0 text-primary-800 cursor-pointer">Do it later</button>
          ) : null}
        </div>
        {more === "screens" ? (
          <ol className="m-0 p-0 list-none">
            {sheet.steps.map((st, i) => (
              <li key={st.title} className="py-3.5 border-t border-gray-200">
                <p className="m-0 text-[15px] font-semibold text-gray-900">{i + 1}. {st.title}</p>
                <p className="m-0 mt-0.5 text-[15px] text-gray-700">{st.answer}</p>
                {st.note ? <p className="m-0 mt-0.5 text-[14px] text-gray-500">{st.note}</p> : null}
              </li>
            ))}
          </ol>
        ) : null}
        {more === "phone" ? (
          <div className="flex flex-col gap-2 pt-1">
            <a href={telHref(SSA_PHONE)} className="text-[17px] font-semibold text-primary-800 no-underline">Call Social Security, {SSA_PHONE}</a>
            <p className="m-0 text-[15px] text-gray-700">&ldquo;{sheet.phoneScript}&rdquo;</p>
          </div>
        ) : null}
      </section>

      <p className="m-0 text-[13px] leading-relaxed text-gray-500">{sheet.disclaimer}</p>
    </div>
  );
}

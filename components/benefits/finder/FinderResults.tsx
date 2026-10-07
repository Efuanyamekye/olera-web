"use client";

import { useEffect, useRef, useState } from "react";
import {
  type FinderProgram,
  STEP_LABELS,
  answerLabel,
  careNeedFromFinder,
  finderVoice,
  incomeRangeFromFinder,
  relationshipFromFinder,
} from "@/lib/benefits/finder-answers";
import { getOrCreateSessionId, getOrCreateVisitId } from "@/lib/analytics/session";
import FinderIcon from "@/components/benefits/finder/FinderIcon";
import { applyAlongHref, startsWithExtraHelp } from "@/lib/benefits/apply-along";
import type { FinderState } from "@/hooks/use-finder";

/**
 * Finder results, redesigned 2026-09-30 (mock: claude.ai/artifact/Tv1tgb3Vr1bfcnMxofh9y4).
 *
 * Every program is visible at low detail, and there is one thing to do.
 * - One white card on the warm page: the first step, with a teal Call
 *   button as the only filled color on the page.
 * - Everything else is flat rows with hairlines, grouped under "Likely to
 *   qualify" and "Worth checking" with counts. Tap a row for more.
 * - Nothing is more than one tap deep except the "left out" list.
 */

const label = "text-[13px] font-semibold uppercase tracking-[0.05em] text-gray-700";
const PREVIEW_ROWS = 5;

const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

/** "Nothing to bring. This is a phone intake. Have ready…" → its first one
 *  or two short sentences, so the list starts short; the full text is one
 *  tap away. */
function shortDoc(text: string): string {
  // No regex lookbehind: iOS Safari before 16.4 cannot parse one, and a
  // parse error takes the whole results bundle down with it.
  // Sentence ends are a period, a space and a capital, so "U.S. citizen"
  // stays whole.
  const parts = text.split(/\.\s+(?=[A-Z])/).map((x, i, all) => (i < all.length - 1 ? `${x}.` : x).trim());
  let out = parts[0] || text;
  if (out.length < 22 && parts[1]) out = `${out} ${parts[1]}`;
  return out.length > 90 ? `${out.slice(0, 88).trimEnd()}…` : out;
}

function PhoneGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6.6 3.5c.8-.5 1.7-.4 2.2.4l1.4 2.4c.5.8.2 1.6-.5 2.1l-.9.7c.7 1.7 2 3.1 3.6 3.8l.8-.9c.6-.7 1.4-.8 2.2-.3l2.3 1.5c.9.6.9 1.7.2 2.6-1.2 1.5-2.9 2-4.6 1.3C9.4 15.6 6.4 12.6 5.1 8.6c-.5-1.7 0-3.3 1.5-4.4Z"
        fill="currentColor"
      />
    </svg>
  );
}

// ── Send the plan ──────────────────────────────────────────────────────────

function SendPlan({ f, id }: { f: FinderState; id: string }) {
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const r = f.result;
  if (!r) return null;

  const send = async () => {
    const value = contact.trim();
    const isEmail = value.includes("@");
    const digits = value.replace(/\D/g, "");
    if (!isEmail && digits.length < 10) {
      setStatus("error");
      setMessage("Enter a 10-digit mobile number or an email address.");
      return;
    }
    setStatus("sending");
    setMessage(null);
    const a = f.answers;
    const programs = [r.firstStep, ...r.programs].filter((p): p is FinderProgram => !!p && p.id !== "local-agency");
    try {
      const res = await fetch("/api/benefits/save-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          careNeed: careNeedFromFinder(a),
          careNeedSource: "stated",
          age: null,
          ageBand: a.age && a.age !== "unsure" ? a.age : undefined,
          medicaidStatus: a.medicaid,
          incomeRange: incomeRangeFromFinder(a.income),
          stateCode: r.stateCode,
          contactChannel: isEmail ? "email" : "sms",
          email: isEmail ? value : undefined,
          phone: isEmail ? undefined : value,
          relationship: relationshipFromFinder(a.who),
          veteranStatus: a.veteran ?? undefined,
          householdSize: a.household ?? undefined,
          finderNeeds: a.needs,
          caregiverNeeds: a.caregiverNeeds,
          entrySource: "/benefits/finder",
          sessionId: getOrCreateSessionId(),
          visitId: getOrCreateVisitId(),
          matchedPrograms: programs.map((p) => ({
            programId: p.id,
            stateId: p.stateId,
            name: p.name,
            shortName: p.shortName,
            programType: "benefit",
          })),
          matchCount: programs.length,
          firstStepProgramId: r.firstStep && r.firstStep.id !== "local-agency" ? r.firstStep.id : undefined,
          finderProgramIds: programs.map((p) => p.id),
          cohort: f.cohort ?? undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "We couldn't send it just now. Please try again.");
      setStatus("sent");
      f.trackContact();
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "We couldn't send it just now. Please try again.");
    }
  };

  if (status === "sent") {
    return (
      <div className="flex flex-col gap-1.5" role="status">
        <p className="text-[16px] font-semibold text-gray-900 m-0">Sent. Check your {contact.includes("@") ? "email" : "texts"}.</p>
        <p className="text-[15px] text-gray-600 m-0">It has the number, what to say and what to bring. A person on our team reads every reply.</p>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <p className="text-[15px] text-gray-600 m-0">The number, what to say and what to bring. A person on our team reads replies.</p>
      <label htmlFor={id} className="sr-only">Mobile number or email</label>
      <input
        id={id}
        value={contact}
        onChange={(e) => {
          setContact(e.target.value);
          if (status === "error") setStatus("idle");
        }}
        type="text"
        autoComplete="on"
        placeholder="Mobile number or email"
        className="w-full rounded-xl border-[1.5px] border-gray-300 bg-white px-4 py-3 text-base text-gray-900 focus:border-primary-700 focus:outline-none"
      />
      {status === "error" && message && (
        <p role="alert" className="text-[14px] text-error-700 m-0">{message}</p>
      )}
      <button
        type="submit"
        disabled={status === "sending"}
        className="min-h-[48px] rounded-xl border-[1.5px] border-primary-300 bg-transparent text-[15px] font-semibold text-primary-800 cursor-pointer disabled:opacity-60 hover:border-primary-700 transition-colors"
      >
        {status === "sending" ? "Sending…" : "Send me this plan"}
      </button>
      <p className="text-[13px] text-gray-500 m-0">Free. We never share it. Reply STOP to stop texts.</p>
    </form>
  );
}

// ── First step ─────────────────────────────────────────────────────────────

function CallButton({ p }: { p: FinderProgram }) {
  if (!p.phone) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <a
        href={telHref(p.phone)}
        className="flex items-center justify-center gap-2.5 w-full min-h-[56px] rounded-xl bg-primary-800 px-4 text-[18px] font-semibold text-white no-underline hover:bg-primary-900 transition-colors whitespace-nowrap"
      >
        <PhoneGlyph />
        Call {p.phone}
      </a>
      {p.hours && <p className="text-center lg:text-left text-[14px] text-gray-600 m-0">{p.hours}</p>}
    </div>
  );
}

function FirstStep({ p, callFor, cardRef, applyHref }: { p: FinderProgram; callFor: string; cardRef: React.RefObject<HTMLElement | null>; applyHref?: string | null }) {
  const isAgency = p.id === "local-agency";
  const [sayOpen, setSayOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  const sayStart = isAgency
    ? `Hi, I'm looking for help finding benefits ${callFor}`
    : `Hi, I'm calling to ask about ${p.shortName}. I'd like to apply ${callFor}`;
  const sayEnd = isAgency
    ? ". Can I talk with a benefits counselor?"
    : `. Could you help me get started?${p.needsMedicaid ? " It needs Medicaid. If they don't have it yet, can we start that application on this call too?" : ""}`;
  const docs = docsOpen ? p.docs : p.docs.slice(0, 1).map(shortDoc);

  return (
    <section
      ref={cardRef}
      aria-label="Your first step"
      className="rounded-2xl border border-gray-200 bg-white p-5 lg:p-7 shadow-[0_4px_14px_rgba(51,38,30,0.08)] grid grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-4 lg:gap-x-8 lg:gap-y-5"
    >
      <div className="lg:col-span-2 flex items-center gap-3.5">
        <FinderIcon name={isAgency ? "helper" : "phone"} size={52} />
        <div className="min-w-0">
          <p className={`${label} m-0`}>Start here</p>
          <h2 className="font-display text-[25px] lg:text-[28px] leading-tight text-gray-900 m-0">{isAgency ? p.name : p.shortName}</h2>
        </div>
      </div>

      <div className="flex flex-col gap-4 min-w-0">
        <p className="text-[16px] text-gray-700 m-0">
          <strong className="font-semibold text-gray-900">Why this one:</strong> {p.reason}
        </p>
        <CallButton p={p} />
        {applyHref ? (
          <a href={applyHref} className="min-h-[52px] rounded-2xl border-[1.5px] border-primary-800 text-primary-800 text-[16px] font-semibold flex items-center justify-center no-underline">
            Or apply online with us, about 20 minutes
          </a>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 min-w-0 lg:border-l lg:border-gray-200 lg:pl-8">
        <div className="rounded-xl bg-vanilla-100 px-4 py-3 text-[15px] text-gray-700">
          <p className={`${label} mb-1 mt-0`}>What to say</p>
          <p className="m-0">
            &ldquo;{sayStart}
            {sayOpen ? `${sayEnd}”` : "…”"}{" "}
            {!sayOpen && (
              <button
                type="button"
                onClick={() => setSayOpen(true)}
                className="bg-transparent border-none p-0 text-[15px] font-semibold text-primary-800 underline underline-offset-2 cursor-pointer"
              >
                Show all
              </button>
            )}
          </p>
        </div>

        {docs.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <p className={`${label} m-0 flex items-center gap-2`}>
              <FinderIcon name="docs" size={24} />
              Before you call
            </p>
            <ul className="m-0 p-0 list-none flex flex-col gap-2">
              {docs.map((d, i) => (
                <li key={i}>
                  <label className="grid grid-cols-[22px_1fr] gap-2.5 items-start cursor-pointer text-[15px] text-gray-700">
                    <input
                      type="checkbox"
                      checked={!!checked[i]}
                      onChange={(e) => setChecked((c) => ({ ...c, [i]: e.target.checked }))}
                      className="mt-0.5 h-5 w-5 accent-primary-800 cursor-pointer"
                    />
                    <span>{d}</span>
                  </label>
                </li>
              ))}
            </ul>
            {!docsOpen && p.docs.length > 1 && (
              <button
                type="button"
                onClick={() => setDocsOpen(true)}
                className="self-start bg-transparent border-none p-0 text-[15px] font-semibold text-primary-800 underline underline-offset-2 cursor-pointer"
              >
                +{p.docs.length - 1} more
              </button>
            )}
          </div>
        )}

        {!isAgency && p.url && (
          <a href={p.url} className="text-[15px] font-medium text-primary-800 no-underline hover:underline">
            Full details, forms and FAQs
          </a>
        )}
      </div>
    </section>
  );
}

// ── Program rows ───────────────────────────────────────────────────────────

function ProgramRow({ p }: { p: FinderProgram }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-t border-gray-200">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="w-full grid grid-cols-[44px_minmax(0,1fr)_16px] gap-3.5 items-center py-3.5 bg-transparent border-none text-left cursor-pointer"
      >
        <FinderIcon name={p.icon} size={40} />
        <span className="min-w-0">
          <span className="block text-[16px] font-semibold text-gray-900 leading-snug">{p.shortName}</span>
          <span className="block text-[15px] text-gray-600 leading-snug mt-0.5">{p.reason}</span>
        </span>
        <span aria-hidden className={`text-gray-400 transition-transform ${open ? "rotate-90" : ""}`}>›</span>
      </button>
      {open && (
        <div className="pl-[58px] pb-4 -mt-1 flex flex-col gap-2 text-[15px] text-gray-700">
          {p.what && <p className="m-0">{p.what}</p>}
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {p.phone && (
              <a href={telHref(p.phone)} className="font-semibold text-primary-800 no-underline hover:underline">
                Call {p.phone}
              </a>
            )}
            <a href={p.url} className="font-medium text-primary-800 no-underline hover:underline">
              Full details
            </a>
          </div>
        </div>
      )}
    </li>
  );
}

function Group({ title, items, total }: { title: string; items: FinderProgram[]; total: number }) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col">
      <h3 className="m-0 pb-1.5 text-[17px] font-semibold text-gray-900">
        {title} <span className="text-[15px] font-normal text-gray-500">{total}</span>
      </h3>
      <ul className="m-0 p-0 list-none">
        {items.map((p) => (
          <ProgramRow key={p.id} p={p} />
        ))}
      </ul>
    </section>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function FinderResults({ f }: { f: FinderState }) {
  const [showAll, setShowAll] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [cardAbove, setCardAbove] = useState(false);
  const [endInView, setEndInView] = useState(false);
  const barVisible = cardAbove && !endInView;
  const cardRef = useRef<HTMLElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const sendRef = useRef<HTMLDivElement | null>(null);
  const r = f.result;

  // Phone: once the first-step card scrolls away, a slim bar keeps Call and
  // "Text me the plan" in reach.
  // It steps aside again at the end of the results, so it never sits on the
  // site footer.
  useEffect(() => {
    const card = cardRef.current;
    const end = endRef.current;
    if (!card || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === card) setCardAbove(!e.isIntersecting && e.boundingClientRect.top < 0);
        if (e.target === end) setEndInView(e.isIntersecting || e.boundingClientRect.top < 0);
      }
    });
    io.observe(card);
    if (end) io.observe(end);
    return () => io.disconnect();
  }, [r]);

  if (!r) return null;
  const a = f.answers;
  const v = finderVoice(a.who);
  const likely = r.programs.filter((p) => p.tier === "likely");
  const check = r.programs.filter((p) => p.tier === "check");

  const countParts = [
    likely.length > 0 ? `${likely.length} likely to qualify` : null,
    check.length > 0 ? `${check.length} worth checking` : null,
  ].filter(Boolean);
  const countDetail = countParts.length ? `: ${countParts.join(", ")}` : "";

  // Preview the first few rows across both groups; "Show all" reveals the rest.
  const likelyShown = showAll ? likely : likely.slice(0, PREVIEW_ROWS);
  const checkShown = showAll ? check : check.slice(0, Math.max(0, PREVIEW_ROWS - likelyShown.length));
  const hidden = r.programs.length - likelyShown.length - checkShown.length;

  const openSend = () => {
    setSendOpen(true);
    window.setTimeout(() => sendRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };

  const answers = (
    <div className="flex flex-col gap-2 text-[14px]">
      <p className={`${label} m-0`}>What you told us</p>
      {f.steps.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => f.goTo(s)}
          title={`Change ${STEP_LABELS[s].toLowerCase()}`}
          className="flex justify-between gap-3 bg-transparent border-none p-0 text-left cursor-pointer group"
        >
          <span className="text-gray-600">{STEP_LABELS[s]}</span>
          <span className="text-right text-gray-900 group-hover:underline">{answerLabel(s, a) ?? "–"}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-8 lg:gap-14 pb-24 lg:pb-0">
      <div className="flex flex-col gap-6 min-w-0">
        <header>
          <p className={`${label} m-0`}>
            Plan for {v.planFor} · {a.place || r.stateName}
          </p>
          <h1 className="font-display text-[32px] lg:text-[40px] leading-[1.1] text-gray-900 mt-1.5 mb-0">Start with one call</h1>
          {/* Counts describe the list below the card, so they match the group
              headers exactly. */}
          {r.programs.length > 0 && (
            <p className="mt-2 mb-0 text-[16px] text-gray-600">
              <strong className="font-semibold text-gray-900">
                {r.firstStep ? "Plus " : ""}
                {r.programs.length} {r.firstStep ? "more " : ""}program{r.programs.length > 1 ? "s" : ""}
              </strong>
              {countDetail}
            </p>
          )}
        </header>

        {r.urgent && (
          <div role="note" className="rounded-2xl bg-error-50 px-4 py-3.5 flex flex-col gap-1">
            <p className="text-[15px] font-semibold text-error-700 m-0">If it can&apos;t wait</p>
            <p className="text-[15px] text-gray-800 m-0">
              Call <strong>2-1-1</strong> for same-day help with a shutoff, food, or a cool or warm place to go today. If anyone
              feels dizzy, confused or very hot, call <strong>911</strong>.
            </p>
          </div>
        )}

        {r.firstStep && (
          <FirstStep
            p={r.firstStep}
            callFor={v.callFor}
            cardRef={cardRef}
            applyHref={r.firstStep.id !== "local-agency" && startsWithExtraHelp(r.firstStep.name)
              ? applyAlongHref({
                  stateCode: r.stateCode,
                  programId: r.firstStep.id,
                  who: f.answers.who,
                  household: f.answers.household === "1" ? "alone" : f.answers.household === "2" ? "couple" : f.answers.household === "3" ? "family" : null,
                  income: f.answers.income,
                  incomeCut: f.answers.incomeCut,
                  savings: f.answers.savings,
                  savingsCut: f.answers.savingsCut,
                })
              : null}
          />
        )}

        {/* Phone: a light line under the card, not a second box. */}
        <div ref={sendRef} className="lg:hidden border-b border-gray-200">
          {sendOpen ? (
            <div className="py-4 flex flex-col gap-2">
              <p className="text-[16px] font-semibold text-gray-900 m-0">Get this plan by text</p>
              <SendPlan f={f} id="finder-send-m" />
            </div>
          ) : (
            <button
              type="button"
              onClick={openSend}
              className="w-full flex items-center justify-between py-4 bg-transparent border-none text-[16px] font-semibold text-primary-800 cursor-pointer"
            >
              Text me this plan <span aria-hidden>›</span>
            </button>
          )}
        </div>

        <Group title="Likely to qualify" items={likelyShown} total={likely.length} />
        <Group title="Worth checking" items={checkShown} total={check.length} />
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="w-full min-h-[50px] rounded-xl border-[1.5px] border-gray-300 bg-white text-[15px] font-semibold text-gray-900 cursor-pointer hover:border-gray-500"
          >
            Show {hidden} more program{hidden > 1 ? "s" : ""}
          </button>
        )}

        {r.agency && (
          <section className="flex flex-col">
            <h3 className="m-0 pb-1.5 text-[17px] font-semibold text-gray-900">Free help applying</h3>
            <div className="border-t border-gray-200 grid grid-cols-[44px_minmax(0,1fr)] gap-3.5 items-center py-3.5">
              <FinderIcon name="helper" size={40} />
              <div className="min-w-0">
                <p className="m-0 text-[16px] font-semibold text-gray-900">{r.agency.name}</p>
                <p className="m-0 text-[15px] text-gray-600">A counselor can help with any of these, at no cost.</p>
                <a href={telHref(r.agency.phone)} className="text-[15px] font-semibold text-primary-800 no-underline hover:underline">
                  {r.agency.phone}
                </a>
              </div>
            </div>
          </section>
        )}

        {r.leftOut.length > 0 && (
          <details className="text-[15px] text-gray-700">
            <summary className="cursor-pointer font-medium">
              {r.leftOut.length} program{r.leftOut.length > 1 ? "s" : ""} we left out, and why
            </summary>
            <ul className="mt-2 pl-5 flex flex-col gap-1">
              {r.leftOut.map((l) => (
                <li key={l.id}>
                  <strong className="font-medium text-gray-900">{l.name}:</strong> {l.reason}
                </li>
              ))}
            </ul>
          </details>
        )}

        <p className="text-[15px] text-gray-600 m-0">
          This is a guide, not an application. Each agency makes the final decision, and it&apos;s always OK to apply.
        </p>

        <div className="lg:hidden border-t border-gray-200 pt-5">{answers}</div>
        <div ref={endRef} aria-hidden className="h-px" />
      </div>

      {/* Desktop: a quiet side column. The recommendation stays dominant. */}
      <aside className="hidden lg:block">
        <div className="sticky top-[96px] flex flex-col gap-5">
          <div className="border-t border-gray-300 pt-5 flex flex-col gap-2">
            <p className="text-[16px] font-semibold text-gray-900 m-0">Get this plan by text</p>
            <SendPlan f={f} id="finder-send-d" />
          </div>
          <div className="border-t border-gray-300 pt-5">{answers}</div>
        </div>
      </aside>

      {/* Phone: slim bar once the card has scrolled away. */}
      {r.firstStep?.phone && (
        <div
          className={`lg:hidden fixed inset-x-0 bottom-0 z-30 flex gap-2.5 border-t border-gray-200 bg-white/95 px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))] backdrop-blur transition-transform duration-200 ${barVisible ? "translate-y-0" : "translate-y-full"}`}
          aria-hidden={!barVisible}
        >
          <a
            href={telHref(r.firstStep.phone)}
            tabIndex={barVisible ? 0 : -1}
            className="flex-[1.4] flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-primary-800 text-[15px] font-semibold text-white no-underline"
          >
            <PhoneGlyph />
            Call
          </a>
          <button
            type="button"
            tabIndex={barVisible ? 0 : -1}
            onClick={openSend}
            className="flex-1 min-h-[48px] rounded-xl border-[1.5px] border-gray-300 bg-white text-[15px] font-semibold text-gray-900 cursor-pointer"
          >
            Text me the plan
          </button>
        </div>
      )}
    </div>
  );
}

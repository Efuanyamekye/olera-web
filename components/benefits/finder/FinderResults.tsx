"use client";

import { useState } from "react";
import {
  type FinderGroup,
  type FinderProgram,
  STEP_LABELS,
  answerLabel,
  careNeedFromFinder,
  finderVoice,
  incomeRangeFromFinder,
  isHelpingSomeone,
  relationshipFromFinder,
} from "@/lib/benefits/finder-answers";
import { getOrCreateSessionId, getOrCreateVisitId } from "@/lib/analytics/session";
import type { FinderState } from "@/hooks/use-finder";

const eyebrow = "text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500";

function Tag({ tier }: { tier: FinderProgram["tier"] | "local" }) {
  const style =
    tier === "check" ? "bg-warning-50 text-warning-700" : "bg-primary-100 text-primary-800";
  const text = tier === "check" ? "Worth checking" : tier === "local" ? "Local" : "Likely";
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${style}`}>{text}</span>;
}

function Phone({ phone, big }: { phone: string; big?: boolean }) {
  return (
    <a
      href={`tel:${phone.replace(/[^\d+]/g, "")}`}
      className={`${big ? "text-[24px] lg:text-[26px]" : "text-[15px]"} font-semibold tabular-nums text-primary-800 no-underline hover:underline select-all`}
    >
      {phone}
    </a>
  );
}

// ── Send the plan ──────────────────────────────────────────────────────────

function SendPlan({ f }: { f: FinderState }) {
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
      <div className="rounded-3xl bg-gray-900 text-white p-5 flex flex-col gap-2">
        <h3 className="text-base font-semibold">Sent. Check your {contact.includes("@") ? "email" : "texts"}.</h3>
        <p className="text-[13px] text-gray-300">
          It has the number, what to say and what to bring. A person on our team reads every reply.
        </p>
      </div>
    );
  }

  return (
    <form
      className="rounded-3xl bg-gray-900 text-white p-5 flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <h3 className="text-base font-semibold">Get this plan by text</h3>
      <p className="text-[13px] text-gray-300">The number, what to say, and what to bring. A person on our team reads replies.</p>
      <label htmlFor="finder-send" className="sr-only">Mobile number or email</label>
      <input
        id="finder-send"
        value={contact}
        onChange={(e) => {
          setContact(e.target.value);
          if (status === "error") setStatus("idle");
        }}
        type="text"
        autoComplete="on"
        placeholder="Mobile number or email"
        className="w-full rounded-2xl border-none bg-white px-4 py-3.5 text-base text-gray-900 focus:outline-2 focus:outline-primary-400"
      />
      {status === "error" && message && (
        <p role="alert" className="text-[13px] text-error-300">{message}</p>
      )}
      <button
        type="submit"
        disabled={status === "sending"}
        className="min-h-[50px] rounded-2xl bg-primary-600 text-white text-base font-semibold border-none cursor-pointer disabled:opacity-60 hover:bg-primary-500 transition-colors"
      >
        {status === "sending" ? "Sending…" : "Send me this plan"}
      </button>
      <p className="text-[12px] text-gray-400">Free. We never share it. Reply STOP to stop texts.</p>
    </form>
  );
}

// ── First step ─────────────────────────────────────────────────────────────

function FirstStep({ p, callFor }: { p: FinderProgram; callFor: string }) {
  const isAgency = p.id === "local-agency";
  const script = isAgency
    ? `Hi, I'm looking for help finding benefits ${callFor === "for myself" ? "for myself" : callFor}. Can I talk with a benefits counselor?`
    : `Hi, I'm calling to ask about ${p.shortName}. I'd like to apply ${callFor}. Could you help me get started?`;
  return (
    <section className="rounded-3xl border-[1.5px] border-primary-600 bg-primary-50 p-5 lg:p-7 grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-5 lg:gap-8">
      <div className="flex flex-col gap-3 min-w-0">
        <p className={eyebrow}>Your first step</p>
        <h3 className="text-[20px] lg:text-[22px] font-semibold text-gray-900">{isAgency ? p.name : p.shortName}</h3>
        <p className="text-[14px] text-gray-700">{p.reason}</p>
        {p.phone && (
          <div>
            <p className="text-[13px] text-gray-500">Call{p.hours ? ` · ${p.hours}` : ""}</p>
            <Phone phone={p.phone} big />
          </div>
        )}
        <blockquote className="m-0 rounded-xl bg-white border-l-[3px] border-primary-600 px-4 py-3 text-[14px] text-gray-700">
          &ldquo;{script}&rdquo;
        </blockquote>
      </div>
      <div className="flex flex-col gap-3 min-w-0">
        {p.docs.length > 0 && (
          <>
            <p className="text-[13px] text-gray-500">Have these nearby</p>
            <ul className="m-0 pl-5 flex flex-col gap-1.5 text-[14px] text-gray-700">
              {p.docs.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </>
        )}
        {p.what && <p className="text-[14px] text-gray-600">{p.what}</p>}
        {!isAgency && p.url && (
          <a href={p.url} className="text-[14px] font-medium text-primary-800 no-underline hover:underline">
            Full details, forms and FAQs
          </a>
        )}
      </div>
    </section>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

type Filter = "all" | FinderGroup;

export default function FinderResults({ f }: { f: FinderState }) {
  const [filter, setFilter] = useState<Filter>("all");
  const r = f.result;
  if (!r) return null;
  const a = f.answers;
  const v = finderVoice(a.who);
  const helping = isHelpingSomeone(a);

  const filters: [Filter, string][] = [
    ["all", "All"],
    ...(helping && r.programs.some((p) => p.group === "you") ? ([["you", "For you"]] as [Filter, string][]) : []),
    ["care", "Care & health"],
    ["bills", "Bills & food"],
  ];
  const shown = r.programs.filter((p) => filter === "all" || p.group === filter);

  const answers = (
    <div className="rounded-3xl border border-gray-200 bg-white p-4 flex flex-col gap-2 text-[14px]">
      <p className={eyebrow}>What you told us</p>
      {f.steps.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => f.goTo(s)}
          title={`Change ${STEP_LABELS[s].toLowerCase()}`}
          className="flex justify-between gap-3 bg-transparent border-none p-0 text-left cursor-pointer group"
        >
          <span className="text-gray-400">{STEP_LABELS[s]}</span>
          <span className="text-right text-gray-800 group-hover:underline">{answerLabel(s, a) ?? "–"}</span>
        </button>
      ))}
      <button
        type="button"
        onClick={() => f.goTo("who")}
        className="self-start mt-1 bg-transparent border-none p-0 text-[13px] font-medium text-primary-800 cursor-pointer hover:underline"
      >
        Change answers
      </button>
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-8 lg:gap-14">
      {/* Desktop: answers and the send box stay on screen beside the plan. */}
      <aside className="hidden lg:block">
        <div className="sticky top-[96px] flex flex-col gap-4">
          {answers}
          <SendPlan f={f} />
        </div>
      </aside>

      <div className="flex flex-col gap-6 min-w-0">
        <div>
          <p className={eyebrow}>
            Plan for {v.planFor} · {a.place || r.stateName}
          </p>
          <h1 className="font-display text-[30px] lg:text-[36px] leading-tight text-gray-900">Start with one call</h1>
        </div>

        {r.urgent && (
          <div role="note" className="rounded-2xl bg-error-50 px-4 py-3.5 flex flex-col gap-1">
            <h3 className="text-[15px] font-semibold text-error-700">If it can&apos;t wait</h3>
            <p className="text-[14px] text-gray-800">
              Call <strong>2-1-1</strong> for same-day help with a shutoff, food, or a cool or warm place to go today. If anyone
              feels dizzy, confused or very hot, call <strong>911</strong>.
            </p>
          </div>
        )}

        {r.firstStep && <FirstStep p={r.firstStep} callFor={v.callFor} />}

        {/* Phone: the send box comes right after the first step. */}
        <div className="lg:hidden">
          <SendPlan f={f} />
        </div>

        {r.programs.length > 0 && (
          <section className="flex flex-col gap-3">
            <p className={eyebrow}>Also worth a call · {r.programs.length}</p>
            <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter programs">
              {filters.map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={filter === k}
                  onClick={() => setFilter(k)}
                  className={[
                    "shrink-0 rounded-full border-[1.5px] px-3.5 py-1.5 text-[13px] font-medium cursor-pointer",
                    filter === k ? "border-primary-600 bg-primary-50 text-primary-800" : "border-gray-200 bg-white text-gray-600",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {shown.map((p) => (
                <article key={p.id} className="rounded-2xl border border-gray-200 bg-white p-4 lg:p-5 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-[16px] font-semibold text-gray-900">
                      <a href={p.url} className="text-inherit no-underline hover:underline">{p.shortName}</a>
                    </h3>
                    <Tag tier={p.tier} />
                  </div>
                  <p className="text-[14px] text-gray-700">{p.reason}</p>
                  {p.what && <p className="text-[13px] text-gray-500">{p.what}</p>}
                  {p.phone && <Phone phone={p.phone} />}
                </article>
              ))}
              {filter === "all" && r.agency && (
                <article className="rounded-2xl border border-gray-200 bg-white p-4 lg:p-5 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-[16px] font-semibold text-gray-900">Free help applying</h3>
                    <Tag tier="local" />
                  </div>
                  <p className="text-[14px] text-gray-700">
                    A benefits counselor at the <strong>{r.agency.name}</strong> can help with any of these, at no cost.
                  </p>
                  <Phone phone={r.agency.phone} />
                </article>
              )}
              {shown.length === 0 && !(filter === "all" && r.agency) && (
                <p className="text-[14px] text-gray-500">Nothing else in this group.</p>
              )}
            </div>
          </section>
        )}

        {r.leftOut.length > 0 && (
          <details className="text-[14px] text-gray-600">
            <summary className="cursor-pointer font-medium">
              {r.leftOut.length} program{r.leftOut.length > 1 ? "s" : ""} we left out, and why
            </summary>
            <ul className="mt-2 pl-5 flex flex-col gap-1">
              {r.leftOut.map((l) => (
                <li key={l.id}>
                  <strong className="font-medium text-gray-800">{l.name}:</strong> {l.reason}
                </li>
              ))}
            </ul>
          </details>
        )}

        <p className="rounded-xl bg-white/70 px-4 py-3 text-[13px] text-gray-600">
          This is a guide, not an application. Each agency makes the final decision, and it&apos;s always OK to apply.
        </p>

        <div className="lg:hidden">{answers}</div>
      </div>
    </div>
  );
}

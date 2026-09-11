"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { CityConfig, CityCareType, CityRecipient, CityUrgency } from "@/lib/city-ads/config";
import { CITY_FORM_VERSION } from "@/lib/city-ads/config";
import { getOrCreateSessionId } from "@/lib/analytics/session";
import { trackGrowthEvent } from "@/lib/analytics/growth-attribution";
import { trackMetaLead } from "@/components/analytics/MetaPixel";
import { newMetaEventId } from "@/lib/city-ads/meta";
import {
  CITY_ARM_COOKIE,
  CITY_ARM_TTL_SECONDS,
  type CityLandingArm,
} from "@/lib/city-ads/landing-variant";
import { CITY_LANDING_COPY, fillCopy, providerCountLabel } from "@/lib/city-ads/landing-copy";

export interface CityProviderCard {
  name: string;
  town: string;
  careLabel: string;
  /** Every care type this provider covers in the city pool. */
  careTypes: string[];
  verified: boolean;
  photo: string | null;
}

/** Pool care_types values rendered for a family rather than a database. */
/** How many provider rows the page ever renders. The count in the copy reads
 *  from this, so the two cannot drift apart again. */
const PROVIDER_CARD_LIMIT = 3;

const CARE_TYPE_LABEL: Record<string, string> = {
  home_care: "Help at home",
  assisted_living: "Assisted living",
  memory_care: "Memory care",
  respite: "Respite care",
  medical: "Nursing care",
};

interface Utm {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  gclid: string | null;
  fbclid: string | null;
}

type Step = "intro" | "who" | "what" | "when" | "guide" | "contact" | "done";

/**
 * The V3 surface, shared by every assigned arm.
 *
 * Warm white ground, charcoal ink, one raspberry action. Three things about it
 * are deliberate and evidence-led rather than taste:
 *
 * 1. THE ACTION COLOUR APPEARS EXACTLY ONCE. On the old page primary-700 painted
 *    the wordmark, the Verified ticks, the step numerals AND the button, so the
 *    element that should have been the most salient thing competed with four
 *    others wearing its colour. Isolation is the part of the CTA-colour
 *    literature that replicates; hue mostly is not.
 * 2. NO DISPLAY SERIF. 87% of this traffic is mobile and the audience skews 45
 *    to 70. A 17px system sans is more legible than an editorial serif and
 *    renders without waiting on a webfont.
 * 3. IT IS NOT THE OLERA BRAND. The page is noindex and the visitor has never
 *    heard of Olera; its only jobs are legible and trustworthy.
 *
 * White on #BE123C is about 6.3:1, which clears WCAG AA for normal text.
 */
const V3 = {
  ground: "#FAF9F6",
  ink: "#222222",
  muted: "#59595F",
  action: "#BE123C",
  actionInk: "#FFFFFF",
  hairline: "#E4E1DA",
} as const;

const WHO: { v: CityRecipient; label: string }[] = [
  { v: "parent", label: "My parent" },
  { v: "spouse", label: "My spouse or partner" },
  { v: "self", label: "Me" },
  { v: "other", label: "Someone else" },
];

const WHAT: { v: CityCareType; label: string; sub: string }[] = [
  { v: "home_care", label: "Help at home", sub: "A caregiver comes to them" },
  { v: "assisted_living", label: "Assisted living or a care home", sub: "They move somewhere with support" },
  { v: "unsure", label: "Not sure yet", sub: "That is fine" },
  { v: "medical", label: "Nursing or medical care", sub: "We will point you the right way" },
];

const WHEN: { v: CityUrgency; label: string }[] = [
  { v: "this_week", label: "This week" },
  { v: "this_month", label: "This month" },
  { v: "planning", label: "Planning ahead" },
];

const PAY = [
  { v: "private_pay", label: "Private pay" },
  { v: "medicaid", label: "Medicaid" },
  { v: "va", label: "VA" },
  { v: "ltc_insurance", label: "LTC insurance" },
  { v: "unsure", label: "Not sure" },
];

export default function CityLandingClient({
  cfg,
  providers,
  utm,
  staffedNow,
  arm,
  previewing = false,
}: {
  cfg: CityConfig;
  providers: CityProviderCard[];
  utm: Utm;
  /**
   * Whether a request made right now gets a same-day call. Computed on the
   * server so the hero promises only what the staffed window can keep; the
   * page is force-dynamic, so this is fresh per request rather than cached.
   */
  staffedNow: boolean;
  /** Which A/B arm the server picked. See lib/city-ads/landing-variant.ts. */
  arm: CityLandingArm;
  /** True when ?v= forced the arm. Suppresses the cookie and all events. */
  previewing?: boolean;
}) {
  const [step, setStep] = useState<Step>("intro");

  // Persist the server's pick so a reload does not re-roll the arm. The server
  // assigns but cannot set cookies from a Server Component, so the client
  // writes it back on first paint.
  useEffect(() => {
    if (previewing) return;
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${CITY_ARM_COOKIE}=${arm}; Max-Age=${CITY_ARM_TTL_SECONDS}; Path=/; SameSite=Lax${secure}`;
  }, [arm, previewing]);

  /**
   * `shortFlow` is retained at false while the stepped flow keeps its four
   * screens. The arm that used it (fewer_questions) was replaced by one_screen;
   * the constant stays so the step maths reads the same in both directions.
   */
  const shortFlow = false;
  // The progress bar counts SCREENS the visitor passes through, and contact is
  // the last of them. The four-question flow is four screens: who, what, when,
  // contact. Deriving the total from a question count produced "Step 4 of 5" in
  // the control, which had read "Step 4 of 4" for the whole first flight.
  /** The whole request on one screen, with the proof below it. */
  const oneScreen = arm === "one_screen";
  /** Two questions, a tailored starting point, then the request. */
  const guided = arm === "guidance";
  /** Every assigned arm wears the V3 surface. Control is reference only. */
  const v3 = arm !== "control";
  const totalSteps = shortFlow ? 2 : guided ? 3 : 4;
  /** Which provider card is open on the providers_first arm. */
  const [expanded, setExpanded] = useState<string | null>(null);

  /** Every word on this page comes from lib/city-ads/landing-copy.ts. */
  const copy = CITY_LANDING_COPY[arm];
  const fill = (t: string) =>
    fillCopy(t, {
      city: cfg.city,
      // Count what is RENDERED, not what was fetched. The page shipped saying
      // "4 providers" above a list sliced to three.
      count: providerCountLabel(Math.min(providers.length, PROVIDER_CARD_LIMIT)),
    });

  /**
   * Paid-traffic funnel: click (Google) -> page_landed -> cta_engaged ->
   * lead_started -> lead row in city_leads.
   *
   * Without this the only observable output of a flight is "leads or no leads",
   * and a page that half-fails (this route is force-dynamic and swallows its
   * provider-card query error) is indistinguishable from one that simply
   * converts badly. page_landed is the important one: reconciled against
   * Google's click count it says whether the page was reached at all.
   *
   * pageCategory is declared explicitly because classifyOrganicPage rejects
   * /care/* on purpose — this is noindex paid traffic and must never enter the
   * organic reporting behind /metrics.
   */
  const fired = useRef<Set<string>>(new Set());
  const fireOnce = (
    eventType: "page_landed" | "cta_engaged" | "lead_started" | "provider_expanded" | "question_viewed",
    extra?: Record<string, unknown>,
    /**
     * Dedupe key, when one event type legitimately fires more than once.
     * question_viewed fires per screen, so it dedupes on the step rather than
     * on the type — keeping them the same string would both collapse four
     * screens into one event AND put "question_viewed:who" in event_type,
     * which the CHECK in migration 223 rejects and the tracker swallows.
     */
    dedupeKey?: string,
  ) => {
    if (previewing) return;
    const key = dedupeKey ?? eventType;
    if (fired.current.has(key)) return;
    fired.current.add(key);
    // The arm rides on EVERY event, not just page_landed.
    //
    // The tracker attaches referrer and UTM metadata to page_landed alone, so
    // an audit reading cta_engaged on its own sees an untagged event and has to
    // recover the channel by joining back to the landing on anonymous_id +
    // visit_id + page_path. That join is easy to get wrong and did get wrong:
    // on 10 Sep it produced a "0 of 25 paid visitors engaged" headline that was
    // false and had to be withdrawn the same day. Stamping the arm directly on
    // each event means the A/B read never depends on reconstructing it.
    trackGrowthEvent({
      eventType,
      pageCategory: "city_landing",
      metadata: { arm, ...(extra || {}) },
    });
  };

  useEffect(() => {
    fireOnce("page_landed");
    // Mount only; fireOnce is idempotent under StrictMode double-invocation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (step !== "intro") fireOnce("cta_engaged");
    if (step === "contact") fireOnce("lead_started");
    // Per-question exposure. cta_engaged and lead_started bracket the quiz but
    // say nothing about what happens INSIDE it, so a visitor who starts and
    // quits on question three is indistinguishable from one who quits on
    // question one. Without this the fewer_questions arm is uninterpretable:
    // if it wins we would not know which of the three dropped questions was
    // the barrier, and if it loses we would not know whether the remaining
    // question was the problem. Keyed per step so it fires once each.
    if (step !== "intro" && step !== "done") {
      fireOnce("question_viewed", { step }, `question_viewed:${step}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // one_screen has no step transitions to hang the funnel off, so its
  // engagement is the first touch of a field. Without this the arm would
  // record landings and submissions and nothing in between, which is the
  // blindness the per-question events were added to fix.
  const markOneScreenStart = () => {
    if (!oneScreen) return;
    fireOnce("cta_engaged");
    fireOnce("lead_started");
  };

  const [who, setWho] = useState<CityRecipient | null>(null);
  const [what, setWhat] = useState<CityCareType | null>(null);
  const [when, setWhen] = useState<CityUrgency | null>(null);
  const [firstName, setFirstName] = useState("");
  const [phone, setPhone] = useState("");
  // The prefill is a convenience on the stepped flow, where the visitor sees
  // the field and can correct it. one_screen does not show a ZIP field at all,
  // so prefilling would silently attach a downtown ZIP as lead context that
  // nobody confirmed. Our one real city lead was in DeSoto, which no pooled
  // Dallas provider can serve — wrong geography is not a cosmetic problem.
  const [zip, setZip] = useState(arm === "one_screen" ? "" : cfg.zipPrefill);
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ leadId: string; redirected: boolean; staffed?: boolean } | null>(null);
  const [payment, setPayment] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [noteSaved, setNoteSaved] = useState(false);
  const [finished, setFinished] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);
  /**
   * The sticky bar hides once the bottom of the form is visible.
   *
   * A bar that sits under a submit button already on screen is furniture: it
   * removes nothing and covers content. The evidence for sticky CTAs is about
   * an action having scrolled OUT of view, so the bar should exist exactly
   * while that is true and not a moment longer.
   */
  const formEndRef = useRef<HTMLDivElement>(null);
  const [formEndVisible, setFormEndVisible] = useState(false);
  useEffect(() => {
    const el = formEndRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setFormEndVisible(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [step, arm]);

  /**
   * Slack ping the moment someone answers the first question. Fired on the
   * first real answer rather than the intro CTA so the alert can say who they
   * are caring for, and once per mount because back-navigation would otherwise
   * re-announce the same person. Writes nothing: a start is not a lead. Never
   * blocks and never surfaces an error — a family mid-form must not see our
   * notification plumbing fail.
   */
  const pinged = useRef(false);
  useEffect(() => {
    if (pinged.current || !who || step === "intro" || step === "who") return;
    pinged.current = true;
    fetch("/api/city-leads/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: cfg.slug, recipient: who, utm }),
      keepalive: true,
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, who]);

  const concierge = cfg.routingMode === "concierge";
  const stepIndex = useMemo<number>(() => {
    const map: Record<Step, number> = shortFlow
      ? { intro: 0, who: 1, what: 1, when: 1, guide: 2, contact: 2, done: 3 }
      : guided
        // Q1 is answered on the landing screen, so a guidance visitor is
        // already one question in by the time the step bar appears.
        ? { intro: 1, who: 1, what: 1, when: 2, guide: 3, contact: 3, done: 4 }
        : { intro: 0, who: 1, what: 2, when: 3, guide: 4, contact: 4, done: 5 };
    return map[step];
  }, [step, shortFlow, guided]);

  useEffect(() => {
    if (step !== "intro") topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step]);

  const submit = async () => {
    setError(null);
    if (!firstName.trim()) return setError("Add your first name.");
    if (phone.replace(/\D/g, "").length < 10) return setError("Add a mobile number so the provider can call you.");
    if (!consent) return setError("Tick the box so a provider can contact you.");
    setBusy(true);
    // Minted here and sent to the route so the browser pixel and the server's
    // Conversions API call carry the SAME id. Meta collapses the pair into one
    // conversion; without it a single submission is counted twice.
    const metaEventId = newMetaEventId();
    try {
      const res = await fetch("/api/city-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: cfg.slug,
          careRecipient: who,
          careType: what,
          urgency: when,
          zip,
          firstName: firstName.trim(),
          phone,
          email: email.trim() || null,
          consent,
          utm,
          sessionId: safeSession(),
          formVersion: CITY_FORM_VERSION,
          metaEventId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }
      // Exactly the gate the route uses for its own conversion calls: routable
      // leads only. A medical request is redirected and never offered to a
      // provider, and a duplicate is the same family submitting twice — the
      // route returns before firing either conversion for both, so the pixel
      // must too or the browser half counts leads the server half does not.
      if (!data.redirected && !data.duplicate) trackMetaLead(metaEventId);
      setResult({ leadId: data.leadId, redirected: Boolean(data.redirected), staffed: data.staffed });
      setStep("done");
    } catch {
      setError("Could not reach Olera. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const patch = async (fields: Record<string, unknown>) => {
    if (!result) return;
    try {
      await fetch("/api/city-leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: result.leadId, phone, ...fields }),
      });
    } catch {
      /* best effort */
    }
  };

  const pick = <T,>(setter: (v: T) => void, next: Step) => (v: T) => {
    setter(v);
    setStep(next);
  };

  return (
    <div
      className="min-h-screen bg-vanilla-50 text-gray-900"
      style={v3 ? { background: V3.ground, color: V3.ink } : undefined}
    >
      <div ref={topRef} />
      <div className="mx-auto max-w-md px-5 pb-16 pt-5 sm:max-w-lg">
        <header className="flex items-center justify-between text-sm">
          <span className="font-semibold tracking-wide text-primary-700">Olera</span>
          <span className="text-gray-500">
            {step === "intro" || step === "done" ? `${cfg.city}, ${cfg.state}` : `Step ${stepIndex} of ${totalSteps}`}
          </span>
        </header>

        {step !== "intro" && step !== "done" && (
          <div className="mt-4 flex gap-1.5" aria-hidden>
            {Array.from({ length: totalSteps }, (_, n) => n + 1).map((i) => (
              <i key={i} className={`h-1 w-7 rounded-full ${i <= stepIndex ? "bg-primary-700" : "bg-primary-100"}`} />
            ))}
          </div>
        )}

        {/* ===================== one_screen =====================
            Three inputs, one screen, one action. No intro to advance past and
            no quiz to complete, because the outcome being optimised is a
            COMPLETED SUBMISSION per paid landing and every other concept on
            the table changes what happens before the form while leaving the
            form itself alone.

            Only the three things the request cannot be made without: care
            type (the API rejects anything else), a first name, and a mobile
            number. ZIP and email are gone — both are optional server-side, and
            a field that is not required is a field that costs submissions for
            information a thirty-second phone call recovers anyway.

            The action colour is deliberately NOT the brand teal. On the other
            arms primary-700 paints the wordmark, the Verified ticks, the step
            numerals AND the button, so the one element that should be the most
            salient thing on the page competes with four others wearing its
            colour. Here the deep slate is used for exactly one thing.
        */}
        {oneScreen && step === "intro" && (
          <section className="pb-28">
            <h1
              className="mt-8 text-[2.05rem] font-semibold leading-[1.12] tracking-tight"
              style={{ color: V3.ink }}
            >
              {fill(copy.headline)}
            </h1>
            <p className="mt-3 text-[17px] leading-snug" style={{ color: V3.muted }}>
              {fill(!staffedNow && copy.subUnstaffed ? copy.subUnstaffed : copy.sub)}
            </p>

            <form
              id="one-screen-request"
              className="mt-7 space-y-6"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <fieldset>
                <legend className="text-[15px] font-semibold text-gray-900">
                  What kind of help?
                </legend>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {WHAT.map((o) => {
                    const on = what === o.v;
                    return (
                      <button
                        key={o.v}
                        type="button"
                        aria-pressed={on}
                        onClick={() => {
                          setWhat(o.v);
                          markOneScreenStart();
                        }}
                        className="min-h-[48px] rounded-full border px-4 text-[15px] font-medium transition-colors"
                        style={
                          on
                            ? { borderColor: V3.action, background: V3.action, color: V3.actionInk }
                            : { borderColor: V3.hairline, background: "#fff", color: V3.ink }
                        }
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <Field label="Your first name">
                <input
                  className={inputCls}
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  onFocus={markOneScreenStart}
                  maxLength={60}
                />
              </Field>

              <Field label="Mobile number" hint="Olera calls or texts you about this request. Never sold.">
                <input
                  className={inputCls}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="(704) 555-0100"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onFocus={markOneScreenStart}
                />
              </Field>

              <label className="flex items-start gap-2.5 text-[12px] leading-snug text-gray-600">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 shrink-0 rounded border-gray-400"
                  style={{ accentColor: V3.action }}
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>
                  I agree that Olera may call or text me at this number about my request, including with
                  automated technology. Consent is not a condition of service. Msg and data rates may apply.
                  Reply STOP to opt out.
                </span>
              </label>

              {error && (
                <p role="alert" className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">
                  {error}
                </p>
              )}

              {/* The form's own submit. The sticky bar is a FALLBACK for when
                  this has scrolled out of view, never the only way to submit —
                  an earlier build had no inline button, so once the bar learned
                  to hide itself the page had no way to send anything. */}
              <button
                type="submit"
                disabled={busy}
                className="block min-h-[54px] w-full rounded-full px-5 text-[17px] font-semibold disabled:opacity-60"
                style={{ background: V3.action, color: V3.actionInk }}
              >
                {busy ? "Sending…" : copy.cta}
              </button>
            </form>
            <div ref={formEndRef} aria-hidden className="h-px" />

            <p className="mt-3.5 text-center text-[13px]" style={{ color: V3.muted }}>
              {copy.micro}
            </p>

            {/* ASK, THEN PROOF. The same real provider records providers_first
                shows above its button appear here BELOW the form. A visitor who
                is ready submits without scrolling; one who is not still gets
                something rather than a dead end. The two arms now differ in
                ORDER alone, which is what makes them comparable. */}
            {providers.length > 0 && (
              <div className="mt-10 border-t pt-7" style={{ borderColor: V3.hairline }}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: V3.muted }}>
                  Providers near {cfg.city}
                </p>
                <ul className="mt-2 divide-y" style={{ borderColor: V3.hairline }}>
                  {providers.slice(0, PROVIDER_CARD_LIMIT).map((p) => (
                    <li key={p.name} className="flex items-center gap-3 py-3">
                      <Avatar name={p.name} photo={p.photo} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-semibold" style={{ color: V3.ink }}>{p.name}</div>
                        <div className="mt-0.5 text-xs" style={{ color: V3.muted }}>
                          {p.careLabel} · {p.town}
                        </div>
                      </div>
                      {p.verified && (
                        <span className="shrink-0 text-xs font-medium" style={{ color: V3.muted }}>✓ Verified</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <footer className="mt-8 text-[11px] leading-relaxed text-gray-400">
              Olera, Inc. · support@olera.care ·{" "}
              <Link className="underline" href="/privacy">Privacy</Link> ·{" "}
              <Link className="underline" href="/terms">Terms</Link>
            </footer>
          </section>
        )}

        {!oneScreen && step === "intro" && (
          <section>
            <h1
              className={
                v3
                  ? "mt-9 text-[2.1rem] font-semibold leading-[1.1] tracking-tight sm:text-[2.5rem]"
                  : "mt-10 font-display text-[2.4rem] leading-[1.05] tracking-tight text-gray-900 sm:text-[2.9rem]"
              }
              style={v3 ? { color: V3.ink } : undefined}
            >
              {fill(copy.headline)}
            </h1>
            <p
              className={v3 ? "mt-3 text-[17px] leading-snug" : "mt-4 text-lg leading-snug text-gray-600"}
              style={v3 ? { color: V3.muted } : undefined}
            >
              {concierge
                ? fill(!staffedNow && copy.subUnstaffed ? copy.subUnstaffed : copy.sub)
                : "A local provider calls you back. Free."}
            </p>

            {guided && (
              <div className="mt-7">
                <p
                  className="text-[11px] font-semibold uppercase tracking-[0.12em]"
                  style={{ color: V3.muted }}
                >
                  Question 1 of 2
                </p>
                <h2 className="mt-1.5 text-[1.45rem] font-semibold leading-tight" style={{ color: V3.ink }}>
                  What kind of help?
                </h2>
                <div className="mt-3.5 flex flex-col gap-2">
                  {WHAT.map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      onClick={() => {
                        setWhat(o.v);
                        setStep("when");
                      }}
                      className="flex min-h-[56px] w-full items-center justify-between rounded-xl border px-4 text-left text-[16px] font-medium"
                      style={{ borderColor: V3.hairline, background: "#fff", color: V3.ink }}
                    >
                      <span>{o.label}</span>
                      <span aria-hidden style={{ color: V3.muted }}>&rarr;</span>
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-center text-xs" style={{ color: V3.muted }}>
                  {copy.micro}
                </p>
              </div>
            )}

            {/* providers_first: proof moves ABOVE the ask, and the proof is
                real rather than decorative.

                The cards TAP OPEN. An arm that promises "see who is near you"
                and delivers a four-question form the moment you touch anything
                is the same bait-and-switch as an ad promising a call "today"
                onto a page that says "in the morning". If this arm is going to
                test whether proof-before-ask works, the proof has to actually
                arrive first. Expanding costs the visitor nothing and commits
                them to nothing, which is the point. */}
            {arm === "providers_first" && providers.length > 0 && (
              <ul className="mt-7 divide-y divide-gray-200 border-y border-gray-200">
                {providers.slice(0, PROVIDER_CARD_LIMIT).map((p) => {
                  const open = expanded === p.name;
                  const types = p.careTypes
                    .map((t) => CARE_TYPE_LABEL[t])
                    .filter(Boolean);
                  return (
                    <li key={p.name}>
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => {
                          setExpanded(open ? null : p.name);
                          if (!open) fireOnce("provider_expanded");
                        }}
                        className="flex w-full items-center gap-3 py-3 text-left"
                      >
                        <Avatar name={p.name} photo={p.photo} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[15px] font-semibold">{p.name}</div>
                          <div className="mt-0.5 text-xs text-gray-500">
                            {p.careLabel} · {p.town}
                          </div>
                        </div>
                        {p.verified && (
                          <span className="shrink-0 text-xs font-medium text-primary-700">✓ Verified</span>
                        )}
                        <span
                          aria-hidden
                          className={`shrink-0 text-gray-400 transition-transform ${open ? "rotate-90" : ""}`}
                        >
                          ›
                        </span>
                      </button>
                      {open && (
                        <div className="pb-4 pl-[52px] text-sm leading-relaxed text-gray-600">
                          <p>
                            {/* The card knows the business's own town, not the
                                area it serves. Saying "and nearby" invented a
                                service-area claim we have no data for. */}
                            Based in {p.town}.
                            {types.length > 0 && ` ${types.join(" · ")}.`}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            {p.verified
                              ? "Listing verified on Olera."
                              : "Listed on Olera."}{" "}
                            An independent business — we do not take a cut of what they charge.
                          </p>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {/* GUIDANCE HAS NO INTRO BUTTON. Its first question is the page.
                Putting the question behind "Show me where to start" costs a tap
                to reveal something that is itself the draw, and Olera's own
                provider pages already show that asking a question is the single
                highest-engagement thing a visitor does. A button that only
                uncovers a question is a toll on the thing people came to do. */}
            {!guided && (
            <button
              type="button"
              onClick={() => setStep(shortFlow ? "what" : "who")}
              className={
                v3
                  ? "mt-7 block min-h-[54px] w-full rounded-full px-5 text-center text-[17px] font-semibold"
                  : "mt-8 block w-full rounded-xl bg-primary-700 px-4 py-4 text-center text-[17px] font-semibold text-white hover:bg-primary-600 active:bg-primary-800"
              }
              style={v3 ? { background: V3.action, color: V3.actionInk } : undefined}
            >
              {copy.cta}
            </button>
            )}
            {/* ONE line, carrying the price and the risk reversal together.
                This shipped as two stacked lines of small grey text, 21 words
                between them, directly under the element that should have been
                unmissable. Airbnb puts an entire listing's value and its risk
                reversal in six words: "From $65 / guest" over "Free
                cancellation". */}
            {/* Guidance renders its own micro line under the question block,
                so the shared one would be a second copy above the questions. */}
            {!guided && (
              <p
                className="mt-2.5 text-center text-xs"
                style={v3 ? { color: V3.muted } : undefined}
              >
                {concierge ? copy.micro : "Four questions · One provider at a time · Never sold"}
              </p>
            )}

            {/* The control and fewer_questions arms keep the cards below, where
                they have sat since the 10 Sep fix. providers_first has already
                rendered them above and must not repeat them. */}
            {providers.length > 0 && arm !== "providers_first" && (
              <div className="mt-12">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {concierge ? `Providers near ${cfg.city}` : `Providers in ${cfg.city}`}
                </p>
                <ul className="mt-1 divide-y divide-gray-200">
                  {providers.slice(0, PROVIDER_CARD_LIMIT).map((p) => (
                    <li key={p.name} className="flex items-center gap-3 py-3">
                      <Avatar name={p.name} photo={p.photo} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-semibold">{p.name}</div>
                        <div className="mt-0.5 text-xs text-gray-500">
                          {p.careLabel} · {p.town}
                        </div>
                      </div>
                      {p.verified && <span className="text-xs font-medium text-primary-700">✓ Verified</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-12">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">How it works</p>
              <ol className="mt-1 divide-y divide-gray-200">
                {(concierge
                  ? ([
                      copy.firstStep,
                      ["We call you", "To understand what you need"],
                      ["We find your provider", "Local, and right for the care"],
                    ] as [string, string][])
                  : ([
                      ["Answer four questions", "About two minutes"],
                      ["We ask a local provider", "You get their name by text"],
                      ["They call you", "Not a fit? We send the next one"],
                    ] as [string, string][])
                ).map(([t, d], i) => (
                  <li key={t} className="flex items-baseline gap-4 py-3">
                    <span className="w-4 shrink-0 font-display text-lg text-primary-700">{i + 1}</span>
                    <span className="text-[15px] font-semibold text-gray-900">{t}</span>
                    <span className="ml-auto text-right text-xs text-gray-500">{d}</span>
                  </li>
                ))}
              </ol>
            </div>

            <footer className="mt-14 text-[11px] leading-relaxed text-gray-400">
              Olera, Inc. · support@olera.care ·{" "}
              <Link className="underline" href="/privacy">
                Privacy
              </Link>{" "}
              ·{" "}
              <Link className="underline" href="/terms">
                Terms
              </Link>
              . Providers are independent businesses.
            </footer>
          </section>
        )}

        {step === "who" && (
          <section>
            <h2 className="mt-6 font-display text-[1.75rem] leading-tight">Who needs care?</h2>
            <div className="mt-3 space-y-2">
              {WHO.map((o) => (
                <Option key={o.v} label={o.label} selected={who === o.v} onClick={() => pick(setWho, "what")(o.v)} />
              ))}
            </div>
          </section>
        )}

        {step === "what" && (
          <section>
            <h2 className="mt-6 font-display text-[1.75rem] leading-tight">What kind of help?</h2>
            <div className="mt-3 space-y-2">
              {WHAT.map((o) => (
                <Option key={o.v} label={o.label} sub={o.sub} selected={what === o.v} onClick={() => pick(setWhat, shortFlow ? "contact" : "when")(o.v)} />
              ))}
            </div>
            {/* On the short arm this is the first question, so Back returns to
                the intro. On the full flow it returns to the recipient question. */}
            <Back onClick={() => setStep(shortFlow ? "intro" : "who")} />
          </section>
        )}

        {step === "when" && (
          <section>
            <h2 className="mt-6 font-display text-[1.75rem] leading-tight">How soon?</h2>
            <div className="mt-3 space-y-2">
              {WHEN.map((o) => (
                <Option key={o.v} label={o.label} selected={when === o.v} onClick={() => pick(setWhen, guided ? "guide" : "contact")(o.v)} />
              ))}
            </div>
            <Back onClick={() => setStep("what")} />
          </section>
        )}

        {/* The guidance arm's payoff. Two answers in, one concrete starting
            point out, BEFORE any contact detail is asked for. The value has to
            actually arrive here or the arm is just a longer form. Both answers
            carry into the request rather than being asked again. */}
        {step === "guide" && (
          <section>
            <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: V3.muted }}>
              Where to start
            </p>
            <h2 className="mt-1.5 text-[1.65rem] font-semibold leading-tight" style={{ color: V3.ink }}>
              {what === "assisted_living"
                ? "Start by touring two or three places."
                : what === "medical"
                  ? "You need a licensed agency, not a caregiver."
                  : what === "unsure"
                    ? "Start with a few hours a week."
                    : "Start with a few hours a week."}
            </h2>
            <p className="mt-3 text-[16px] leading-relaxed" style={{ color: V3.muted }}>
              {what === "assisted_living"
                ? `Most ${cfg.city} families visit two or three communities before deciding. Costs and what is included vary a lot between them, so seeing them side by side is worth the afternoon.`
                : what === "medical"
                  ? `Nursing and medical care at home has to come from a licensed home health agency, which is different from the everyday help most ${cfg.city} families start with. We will point you at the right kind of provider rather than the wrong one.`
                  : what === "unsure"
                    ? `Most families start smaller than they expect. A few hours a week of help with meals, dressing and errands covers a lot, and it is easy to add more later.`
                    : `Most ${cfg.city} families begin with a few hours a week rather than full days, then add hours as they need them. Agencies usually have a minimum, often around four hours per visit.`}
            </p>
            {when && (
              <p className="mt-3 text-[16px] leading-relaxed" style={{ color: V3.muted }}>
                {when === "this_week"
                  ? "Because you need this week, the practical constraint is who has availability now rather than who looks best on paper."
                  : when === "this_month"
                    ? "A month is enough time to compare a few options properly without rushing the decision."
                    : "Planning ahead is the cheapest time to do this. Nothing has to be decided today."}
              </p>
            )}
            <div className="mt-7 border-t pt-6" style={{ borderColor: V3.hairline }}>
              <h3 className="text-[1.3rem] font-semibold leading-tight" style={{ color: V3.ink }}>
                Talk it through with Olera.
              </h3>
              <p className="mt-1.5 text-[15px] leading-relaxed" style={{ color: V3.muted }}>
                We will go through local options with you and what to ask them. Free for families.
              </p>
              <button
                type="button"
                onClick={() => setStep("contact")}
                className="mt-4 block min-h-[52px] w-full rounded-full px-5 text-[17px] font-semibold"
                style={{ background: V3.action, color: V3.actionInk }}
              >
                {"Request a call"}
              </button>
              <p className="mt-2.5 text-center text-[12.5px]" style={{ color: V3.muted }}>
                {copy.micro}
              </p>
            </div>
            <Back onClick={() => setStep("when")} />
          </section>
        )}

        {step === "contact" && (
          <section>
            <h2 className="mt-6 font-display text-[1.75rem] leading-tight">Where should they call?</h2>
            <form
              className="mt-3 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <Field label="First name">
                <input
                  className={inputCls}
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  maxLength={60}
                />
              </Field>
              <Field label="Mobile number" hint="So the provider can call you. Never sold.">
                <input
                  className={inputCls}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="(704) 555-0100"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </Field>
              <Field label="ZIP">
                <input
                  className={inputCls}
                  inputMode="numeric"
                  autoComplete="postal-code"
                  value={zip}
                  onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
                />
              </Field>
              <Field label="Email (optional)">
                <input
                  className={inputCls}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>

              <label className="flex items-start gap-2.5 pt-1 text-[11.5px] leading-snug text-gray-600">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-400 accent-primary-700"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>
                  I agree that Olera{concierge ? "" : ` and the ${cfg.city} area care provider it matches me with (one at a time, up to three)`} may
                  call or text me at this number about my request, including with automated technology. Consent is not a
                  condition of service. Msg and data rates may apply. Reply STOP to opt out.
                </span>
              </label>

              {error && (
                <p role="alert" className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="block w-full rounded-xl bg-primary-700 px-4 py-3.5 text-center text-base font-semibold text-white hover:bg-primary-600 disabled:opacity-60"
              >
                {busy ? "Sending…" : `Get my ${cfg.city} match`}
              </button>
            </form>
            <Back onClick={() => setStep(shortFlow ? "what" : "when")} />
          </section>
        )}

        {/* ===================== sticky action bar =====================
            Airbnb's pattern, not just "a button that follows you": the bar is
            TWO parts, the terms on the left and the action on the right, with
            the risk reversal sitting under the terms rather than buried in the
            page. Their listing bar reads "From $65 / guest · Free cancellation"
            next to "Show dates"; ours reads what the visitor gets next to what
            the visitor does.

            It renders on one_screen only. The evidence for sticky CTAs is real
            (12-28% on deep-page conversions) but the MECHANISM is "the action
            has scrolled out of view on a long page". Control is a single
            viewport with its button above the fold, so a bar there would add
            furniture and remove nothing. one_screen is long enough for the
            mechanism to apply, which is the whole reason it earns one.

            W3C F110: sticky content that covers a focused control is an
            accessibility failure, so the section above reserves pb-28 and the
            bar sits inside the safe area rather than over it.
        */}
        {oneScreen && step === "intro" && !formEndVisible && (
          <div
            className="fixed inset-x-0 bottom-0 z-20 border-t backdrop-blur"
            style={{
              paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))",
              borderColor: V3.hairline,
              background: "rgba(250,249,246,0.95)",
            }}
          >
            <div className="mx-auto flex max-w-md items-center gap-3 px-5 pt-2.5 sm:max-w-lg">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold leading-tight" style={{ color: V3.ink }}>
                  A real person calls you
                </p>
                <p className="text-[12px] leading-tight" style={{ color: V3.muted }}>
                  Free · Does not book care
                </p>
              </div>
              <button
                type="submit"
                form="one-screen-request"
                disabled={busy}
                className="min-h-[50px] shrink-0 rounded-full px-7 text-[16px] font-semibold disabled:opacity-60"
                style={{ background: V3.action, color: V3.actionInk }}
              >
                {busy ? "Sending…" : copy.cta}
              </button>
            </div>
          </div>
        )}

        {step === "done" && result && (
          <section>
            <div className="mt-6 flex h-11 w-11 items-center justify-center rounded-full bg-success-50 text-xl text-success-700">✓</div>
            {result.redirected ? (
              <>
                <h2 className="mt-4 font-display text-2xl leading-tight">Thanks, {firstName.trim()}. This one is outside what we arrange.</h2>
                <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
                  Olera arranges non-medical help at home and assisted living. For nursing or medical care at home, ask the
                  hospital discharge planner or the doctor for a home health referral. Medicare usually covers it. If you
                  also need help with daily life at home, you can start again and pick &ldquo;Help at home&rdquo;.
                </p>
                <button type="button" onClick={() => window.location.reload()} className="mt-5 block w-full rounded-xl border border-primary-300 bg-white px-4 py-3 text-center text-[15px] font-semibold text-primary-700">
                  Start again
                </button>
              </>
            ) : (
              <>
                {finished ? (
                  <>
                    <h2 className="mt-4 font-display text-[1.75rem] leading-tight">All set, {firstName.trim()}.</h2>
                    <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
                      {concierge
                        ? result.staffed === false
                          ? "Someone from Olera will call you in the morning. Keep your phone nearby."
                          : "Someone from Olera will call you today. Keep your phone nearby."
                        : result.staffed === false
                          ? `A ${cfg.city} provider will confirm in the morning and call you. Keep your phone nearby.`
                          : `A ${cfg.city} provider is being asked now. Keep your phone nearby.`}
                    </p>
                    <div className="mt-6 divide-y divide-gray-200 border-y border-gray-200 text-sm">
                      <div className="flex justify-between gap-4 py-3">
                        <span className="text-gray-500">Looking for</span>
                        <span className="text-right font-medium text-gray-900">
                          {WHAT.find((w) => w.v === what)?.label ?? "Care"}
                          {who ? ` for ${WHO.find((w) => w.v === who)?.label.toLowerCase().replace(/^my /, "your ") ?? ""}` : ""}
                        </span>
                      </div>
                      {when && (
                        <div className="flex justify-between gap-4 py-3">
                          <span className="text-gray-500">Starting</span>
                          <span className="font-medium text-gray-900">{WHEN.find((w) => w.v === when)?.label}</span>
                        </div>
                      )}
                      {payment && (
                        <div className="flex justify-between gap-4 py-3">
                          <span className="text-gray-500">Paying with</span>
                          <span className="font-medium text-gray-900">{PAY.find((p) => p.v === payment)?.label}</span>
                        </div>
                      )}
                      {note.trim() && (
                        <div className="py-3">
                          <span className="block text-gray-500">Your note</span>
                          <span className="mt-1 block text-gray-900">“{note.trim()}”</span>
                        </div>
                      )}
                    </div>
                    <p className="mt-6 text-sm text-gray-500">
                      {concierge
                        ? "We will talk through what you need and introduce you to the right local provider. Nothing is booked or charged."
                        : "You will get a text with the provider\u2019s name, then a call. Not a fit? Reply to the text and we send the next one."}
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="mt-4 font-display text-[1.75rem] leading-tight">Thanks, {firstName.trim()}. We are on it.</h2>
                    <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
                      {concierge
                        ? result.staffed === false
                          ? "Someone from Olera will call you in the morning."
                          : "Someone from Olera will call you today."
                        : result.staffed === false
                          ? `A ${cfg.city} provider will confirm in the morning. We will text you their name.`
                          : `Watch for a text with your ${cfg.city} provider's name within the hour.`}
                    </p>

                    <div className="mt-8">
                      <p className="text-xs font-semibold text-gray-600">How would care be paid for? Optional.</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {PAY.map((p) => (
                          <button
                            key={p.v}
                            type="button"
                            onClick={() => {
                              setPayment(p.v);
                              void patch({ paymentType: p.v });
                            }}
                            className={`rounded-full border px-3 py-1 text-xs ${
                              payment === p.v ? "border-primary-700 bg-primary-50 text-primary-800" : "border-gray-300 bg-white text-gray-700"
                            }`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="mt-5">
                      <label className="text-xs font-semibold text-gray-600">Anything they should know? Optional.</label>
                      <textarea
                        className={`${inputCls} mt-1 min-h-[72px]`}
                        placeholder="Mom is 84, just home from the hospital after a fall, needs help mornings and evenings…"
                        value={note}
                        onChange={(e) => {
                          setNote(e.target.value);
                          setNoteSaved(false);
                        }}
                        maxLength={600}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (note.trim()) void patch({ note });
                          setNoteSaved(true);
                          setFinished(true);
                        }}
                        className="mt-3 block w-full rounded-xl bg-primary-700 px-4 py-3.5 text-center text-base font-semibold text-white hover:bg-primary-600"
                      >
                        {note.trim() ? "Send note and finish" : "Finish"}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

const inputCls =
  "block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-gray-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] text-gray-500">{hint}</span>}
    </label>
  );
}

function Option({ label, sub, selected, onClick }: { label: string; sub?: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full rounded-xl border px-4 py-3 text-left text-base ${
        selected ? "border-primary-700 bg-primary-50 ring-1 ring-primary-700" : "border-gray-300 bg-white hover:border-primary-400"
      }`}
    >
      <span className="block">{label}</span>
      {sub && <span className="mt-0.5 block text-xs text-gray-500">{sub}</span>}
    </button>
  );
}

function Avatar({ name, photo }: { name: string; photo: string | null }) {
  // A stored image URL is not proof of a live image: provider photos rot (dead
  // Unsplash links, expired Places photoUris, retired CDN hosts). A broken glyph
  // on a page whose whole job is trust is worse than no photo, so a failed load
  // falls back to initials.
  const [broken, setBroken] = useState(false);
  const initials = name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  const showPhoto = Boolean(photo) && !broken;
  return (
    <span
      className={`relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-semibold ${
        showPhoto ? "border border-gray-200 bg-white" : "bg-primary-100 text-primary-800"
      }`}
    >
      {showPhoto ? (
        <Image src={photo!} alt="" fill sizes="44px" quality={70} className="object-cover" onError={() => setBroken(true)} />
      ) : (
        initials
      )}
    </span>
  );
}

function Back({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mt-5 text-sm text-gray-500 underline-offset-2 hover:underline">
      Back
    </button>
  );
}

function safeSession(): string | null {
  try {
    return getOrCreateSessionId();
  } catch {
    return null;
  }
}

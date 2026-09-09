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

export interface CityProviderCard {
  name: string;
  town: string;
  careLabel: string;
  verified: boolean;
  photo: string | null;
}

interface Utm {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  gclid: string | null;
  fbclid: string | null;
}

type Step = "intro" | "who" | "what" | "when" | "contact" | "done";

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
}) {
  const [step, setStep] = useState<Step>("intro");

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
  const fireOnce = (eventType: "page_landed" | "cta_engaged" | "lead_started") => {
    if (fired.current.has(eventType)) return;
    fired.current.add(eventType);
    trackGrowthEvent({ eventType, pageCategory: "city_landing" });
  };

  useEffect(() => {
    fireOnce("page_landed");
    // Mount only; fireOnce is idempotent under StrictMode double-invocation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (step !== "intro") fireOnce("cta_engaged");
    if (step === "contact") fireOnce("lead_started");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const [who, setWho] = useState<CityRecipient | null>(null);
  const [what, setWhat] = useState<CityCareType | null>(null);
  const [when, setWhen] = useState<CityUrgency | null>(null);
  const [firstName, setFirstName] = useState("");
  const [phone, setPhone] = useState("");
  const [zip, setZip] = useState(cfg.zipPrefill);
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
  const stepIndex = useMemo(() => ({ intro: 0, who: 1, what: 2, when: 3, contact: 4, done: 5 })[step], [step]);

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
    <div className="min-h-screen bg-vanilla-50 text-gray-900">
      <div ref={topRef} />
      <div className="mx-auto max-w-md px-5 pb-16 pt-5 sm:max-w-lg">
        <header className="flex items-center justify-between text-sm">
          <span className="font-semibold tracking-wide text-primary-700">Olera</span>
          <span className="text-gray-500">
            {step === "intro" || step === "done" ? `${cfg.city}, ${cfg.state}` : `Step ${stepIndex} of 4`}
          </span>
        </header>

        {step !== "intro" && step !== "done" && (
          <div className="mt-4 flex gap-1.5" aria-hidden>
            {[1, 2, 3, 4].map((i) => (
              <i key={i} className={`h-1 w-7 rounded-full ${i <= stepIndex ? "bg-primary-700" : "bg-primary-100"}`} />
            ))}
          </div>
        )}

        {step === "intro" && (
          <section>
            <h1 className="mt-10 font-display text-[2.4rem] leading-[1.05] tracking-tight text-gray-900 sm:text-[2.9rem]">
              Looking for senior care in {cfg.city}?
            </h1>
            <p className="mt-4 text-lg leading-snug text-gray-600">
              {concierge
                ? staffedNow
                  ? "Tell us what you need. We call you back today. Free."
                  : "Tell us what you need. We call you back in the morning. Free."
                : "A local provider calls you back. Free."}
            </p>
            <button
              type="button"
              onClick={() => setStep("who")}
              className="mt-8 block w-full rounded-xl bg-primary-700 px-4 py-4 text-center text-[17px] font-semibold text-white hover:bg-primary-600 active:bg-primary-800"
            >
              Get started
            </button>
            <p className="mt-3 text-center text-xs text-gray-500">
              {concierge ? "Four questions · We call you back · Never sold" : "Four questions · One provider at a time · Never sold"}
            </p>

            {providers.length > 0 && (
              <div className="mt-12">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {concierge ? `Providers near ${cfg.city}` : `Providers in ${cfg.city}`}
                </p>
                <ul className="mt-1 divide-y divide-gray-200">
                  {providers.slice(0, 3).map((p) => (
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
                      ["Answer four questions", "About two minutes"],
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
                <Option key={o.v} label={o.label} sub={o.sub} selected={what === o.v} onClick={() => pick(setWhat, "when")(o.v)} />
              ))}
            </div>
            <Back onClick={() => setStep("who")} />
          </section>
        )}

        {step === "when" && (
          <section>
            <h2 className="mt-6 font-display text-[1.75rem] leading-tight">How soon?</h2>
            <div className="mt-3 space-y-2">
              {WHEN.map((o) => (
                <Option key={o.v} label={o.label} selected={when === o.v} onClick={() => pick(setWhen, "contact")(o.v)} />
              ))}
            </div>
            <Back onClick={() => setStep("what")} />
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
            <Back onClick={() => setStep("when")} />
          </section>
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

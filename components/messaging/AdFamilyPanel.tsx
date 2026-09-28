"use client";

/**
 * A family from an ad, opened in the provider's inbox.
 *
 * Three states (lib/city-ads/provider-inbox.server.ts): an offer to take or
 * pass, a family she took, or a family from her own ad. The conversation sits
 * in the middle; what the family needs, how to reach them and how it went sit
 * on the right on a laptop, and in a sheet on a phone.
 */

import { useCallback, useEffect, useRef, useState } from "react";

type Entry = {
  at: string;
  author: "olera" | "provider" | "family";
  kind: "message" | "event";
  text: string;
  channel?: string;
};

export type AdFamilyDetail = {
  leadId: string;
  access: "own_ad" | "offered" | "taken";
  name: string;
  city: string;
  need: string;
  expiresAt: string | null;
  outcome: "talking" | "client" | "no" | null;
  closed: boolean;
  phone: string | null;
  email: string | null;
  facts: string[];
  words: string[];
  entries: Entry[];
  canMessage: boolean;
  timeZone: string;
};

const OUTCOMES: Array<{ value: "talking" | "client" | "no"; label: string }> = [
  { value: "talking", label: "Talked" },
  { value: "client", label: "Became a client" },
  { value: "no", label: "Not a fit" },
];

function timeOf(iso: string, tz: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
}

function dayOf(iso: string, tz: string): string {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: tz });
}

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

function PhoneIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
    </svg>
  );
}

export default function AdFamilyPanel({
  leadId,
  onBack,
  onChanged,
  className = "",
}: {
  leadId: string;
  onBack: () => void;
  /** Something changed that the list shows (a message, a take, an outcome). */
  onChanged: () => void;
  className?: string;
}) {
  const [family, setFamily] = useState<AdFamilyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/provider/ad-families?leadId=${encodeURIComponent(leadId)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't open this family.");
      setFamily(json.family as AdFamilyDetail);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open this family.");
    }
  }, [leadId]);

  useEffect(() => {
    setFamily(null);
    setDraft("");
    setActionError(null);
    setSheetOpen(false);
    load();
  }, [load]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [family?.entries.length]);

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(action);
    setActionError(null);
    try {
      const res = await fetch("/api/provider/ad-families", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, action, ...extra }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "That didn't go through. Try again.");
      if (action === "message") setDraft("");
      if (action === "pass") {
        onChanged();
        onBack();
        return;
      }
      await load();
      onChanged();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "That didn't go through. Try again.");
    } finally {
      setBusy(null);
    }
  };

  if (error) {
    return (
      <div className={`flex-col items-center justify-center bg-white p-6 text-center ${className}`}>
        <p className="text-[15px] text-gray-600">{error}</p>
        <button onClick={onBack} className="mt-4 text-sm font-medium text-primary-600 lg:hidden">
          Back to inbox
        </button>
      </div>
    );
  }
  if (!family) {
    return (
      <div className={`flex-col items-center justify-center bg-white ${className}`}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  const f = family;
  const offered = f.access === "offered";
  const tz = f.timeZone;

  const details = (
    <div className="flex flex-col gap-7 px-6 py-6">
      <section>
        <h3 className="text-[13px] font-semibold uppercase tracking-wide text-gray-500">What they need</h3>
        <ul className="mt-2.5 flex flex-col gap-1.5 text-[15px] text-gray-900">
          {f.facts.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </section>
      {f.words.length > 0 && (
        <section>
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-gray-500">In their words</h3>
          <div className="mt-2.5 flex flex-col gap-2">
            {f.words.map((w, i) => (
              <p key={i} className="border-l-2 border-primary-200 pl-3 text-[15px] leading-relaxed text-gray-800">
                &ldquo;{w}&rdquo;
              </p>
            ))}
          </div>
        </section>
      )}
      {offered ? (
        <section>
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-gray-500">Contact</h3>
          <p className="mt-2.5 text-[15px] text-gray-600">Their name and number show as soon as you take this family.</p>
        </section>
      ) : (
        <section>
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-gray-500">Contact</h3>
          <div className="mt-2.5 flex flex-col gap-1 text-[15px] text-gray-900">
            {f.phone && <span className="tabular-nums">{f.phone}</span>}
            {f.email && <span className="break-all text-gray-600">{f.email}</span>}
          </div>
          {f.phone && (
            <a
              href={telHref(f.phone)}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary-600 text-[15px] font-semibold text-white hover:bg-primary-700"
            >
              <PhoneIcon />
              Call {f.name}
            </a>
          )}
        </section>
      )}
      {!offered && (
        <section>
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-gray-500">How did it go?</h3>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {OUTCOMES.map((o) => (
              <button
                key={o.value}
                onClick={() => act("outcome", { value: o.value })}
                disabled={!!busy}
                className={`rounded-full border px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
                  f.outcome === o.value
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 text-gray-700 hover:border-gray-400"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">Only you and Olera see this.</p>
        </section>
      )}
    </div>
  );

  return (
    <div className={`min-w-0 bg-white ${className}`}>
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex h-[68px] shrink-0 items-center gap-3 border-b border-gray-200 pl-4 pr-4 sm:pl-6">
          <button
            onClick={onBack}
            className="-ml-2 mr-1 flex h-11 w-11 items-center justify-center rounded-full hover:bg-gray-100 lg:hidden"
            aria-label="Back to conversations"
          >
            <svg className="h-5 w-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm font-bold text-primary-700">
            {offered ? "?" : f.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <span className="block truncate text-lg font-display font-semibold text-gray-900">{f.name}</span>
            <p className="truncate text-sm text-gray-500">
              {f.access === "own_ad" ? "From your ad" : "From Olera"} · {f.city}
            </p>
          </div>
          {!offered && f.phone && (
            <a
              href={telHref(f.phone)}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700 lg:hidden"
            >
              <PhoneIcon />
              Call
            </a>
          )}
          {/* The offer already shows its details in the page. */}
          {!offered && (
            <button
              onClick={() => setSheetOpen(true)}
              aria-label="Details"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 lg:hidden"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v5M12 8h.01" />
              </svg>
            </button>
          )}
        </div>

        {/* Who reads this */}
        <p className="flex shrink-0 items-center gap-1.5 border-b border-gray-100 px-4 py-2 text-xs text-gray-500 sm:px-6">
          <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          <span className="truncate">
            {offered
              ? "Olera sent this request only to you. Take it to see who they are."
              : `Only you, ${f.name} and Olera's care team can see this conversation`}
          </span>
        </p>

        {offered ? (
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto flex max-w-[560px] flex-col gap-6 px-6 py-8">
              <div>
                <p className="text-sm font-medium text-primary-700">New request from Olera</p>
                <h2 className="mt-1 text-2xl font-display font-bold text-gray-900 [text-wrap:balance]">{f.need}</h2>
                {f.expiresAt && (
                  <p className="mt-2 text-[15px] text-gray-600">Open until {timeOf(f.expiresAt, tz)} their time.</p>
                )}
              </div>
              <div className="-mx-6 lg:hidden">{details}</div>
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <button
                  onClick={() => act("take")}
                  disabled={!!busy}
                  className="h-12 w-full shrink-0 rounded-xl bg-primary-600 sm:w-auto sm:flex-1 text-[15px] font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
                >
                  {busy === "take" ? "Taking…" : "Take this family"}
                </button>
                <button
                  onClick={() => act("pass")}
                  disabled={!!busy}
                  className="h-12 shrink-0 rounded-xl border border-gray-300 px-6 text-[15px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  {busy === "pass" ? "Passing…" : "Pass"}
                </button>
              </div>
              <p className="text-sm text-gray-500">
                Take it and we send you their name and number, and tell them to expect your call.
              </p>
              {actionError && <p className="text-sm text-red-600">{actionError}</p>}
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
              <div className="flex flex-col gap-3">
                {f.entries.map((e, i) => {
                  const prev = f.entries[i - 1];
                  const newDay = !prev || dayOf(prev.at, tz) !== dayOf(e.at, tz);
                  const day = newDay ? (
                    <p className="pt-2 text-center text-sm font-medium text-gray-400">{dayOf(e.at, tz)}</p>
                  ) : null;
                  if (e.kind === "event") {
                    return (
                      <div key={i} className="flex flex-col gap-3">
                        {day}
                        <p className="mx-auto max-w-[85%] text-center text-[13px] leading-snug text-gray-500">
                          {e.text} <span className="whitespace-nowrap text-gray-400">· {timeOf(e.at, tz)}</span>
                        </p>
                      </div>
                    );
                  }
                  const mine = e.author === "provider";
                  const who = mine ? "You" : e.author === "olera" ? "Olera" : f.name;
                  return (
                    <div key={i} className="flex flex-col gap-3">
                      {day}
                      <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                        <div
                          className={`max-w-[78%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-base leading-relaxed ${
                            mine
                              ? "rounded-br-md bg-primary-600 text-white"
                              : e.author === "olera"
                                ? "rounded-bl-md border border-primary-100 bg-primary-50 text-gray-800"
                                : "rounded-bl-md bg-gray-100 text-gray-800"
                          }`}
                        >
                          {e.text}
                        </div>
                        <p className="mx-1 mt-1.5 text-xs text-gray-400">
                          {who} · {timeOf(e.at, tz)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {f.entries.length === 0 && (
                  <p className="py-10 text-center text-[15px] text-gray-500">No messages yet. A call is the best first step.</p>
                )}
                <div ref={end} />
              </div>
            </div>

            {f.canMessage ? (
              <div className="px-4 py-4 sm:px-6">
                {actionError && <p className="mb-2 text-sm text-red-600">{actionError}</p>}
                <div className="overflow-hidden rounded-2xl border border-gray-300 transition-all focus-within:border-gray-400 focus-within:shadow-sm">
                  <textarea
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      e.target.style.height = "auto";
                      e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && draft.trim()) {
                        e.preventDefault();
                        act("message", { body: draft });
                      }
                    }}
                    placeholder={`Message ${f.name}`}
                    disabled={!!busy}
                    rows={1}
                    className="w-full resize-none bg-transparent px-4 pb-3 pt-3.5 text-base leading-relaxed text-gray-900 outline-none placeholder:text-gray-400 disabled:opacity-50"
                  />
                  <div className="flex items-center justify-between gap-3 px-4 pb-3">
                    <p className="text-xs text-gray-500">They get a text with a link{f.email ? " and an email" : ""}.</p>
                    <button
                      type="button"
                      onClick={() => act("message", { body: draft })}
                      disabled={!!busy || !draft.trim()}
                      aria-label="Send"
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all ${
                        draft.trim() ? "bg-primary-600 text-white hover:bg-primary-700" : "bg-gray-200 text-gray-400"
                      }`}
                    >
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5m0 0l-7 7m7-7l7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="border-t border-gray-100 px-6 py-4 text-center text-sm text-gray-500">This conversation is closed.</p>
            )}
          </>
        )}
      </div>

      {/* Right panel on a laptop */}
      <aside className="hidden w-[360px] shrink-0 overflow-y-auto border-l border-gray-200 lg:block">{details}</aside>

      {/* Sheet on a phone */}
      {sheetOpen && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/50 lg:hidden" onClick={() => setSheetOpen(false)} />
          <div className="fixed inset-x-0 bottom-0 z-[70] flex max-h-[85dvh] flex-col rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl lg:hidden">
            <div className="flex shrink-0 justify-center pb-2 pt-3">
              <div className="h-1 w-10 rounded-full bg-gray-300" />
            </div>
            <div className="flex-1 overflow-y-auto">{details}</div>
          </div>
        </>
      )}
    </div>
  );
}

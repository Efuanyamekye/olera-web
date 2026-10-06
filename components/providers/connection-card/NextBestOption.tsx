"use client";

import { useEffect, useState } from "react";
import { getOrCreateSessionId, getOrCreateVisitId } from "@/lib/analytics/session";

/**
 * "Would you like to see the next best option nearby?" — shown once, right
 * after a family sends an inquiry (6 Oct, TJ). See
 * lib/connections/next-best-option.server.ts for why it is one provider, by
 * distance, and only ever after the family's own inquiry has gone.
 *
 * The match is fetched before anything renders, so the question only appears
 * when there is an answer: no "nothing nearby" dead end. Nothing is sent until
 * the family taps the send button.
 */

interface Option {
  providerId: string;
  slug: string;
  name: string;
  city: string | null;
  state: string | null;
  distanceMi: number;
  rating: number | null;
  reviewCount: number | null;
}

const SHOWN_KEY = "olera_next_best_option_shown";

type Phase = "ask" | "open" | "sending" | "sent";

export default function NextBestOption({
  connectionId,
  providerName,
}: {
  connectionId: string;
  providerName: string;
}) {
  const [option, setOption] = useState<Option | null>(null);
  const [phase, setPhase] = useState<Phase>("ask");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Once per browsing session, whichever provider page it was.
    try {
      if (sessionStorage.getItem(SHOWN_KEY)) return;
    } catch {
      // storage blocked: still show it on this page
    }
    let cancelled = false;
    const load = async (retry: boolean): Promise<void> => {
      const res = await fetch(`/api/connections/next-best-option?connectionId=${encodeURIComponent(connectionId)}`);
      // A guest's session is set in the background after the inquiry; give it
      // one more moment before deciding there is nobody signed in.
      if (res.status === 401 && retry) {
        await new Promise((r) => setTimeout(r, 2000));
        return load(false);
      }
      if (!res.ok) return;
      const data = (await res.json()) as { option: Option | null };
      if (cancelled || !data.option) return;
      setOption(data.option);
      try {
        sessionStorage.setItem(SHOWN_KEY, "1");
      } catch {
        // ignore
      }
    };
    load(true).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [connectionId]);

  if (!option) return null;

  const place = [option.city, option.state].filter(Boolean).join(", ");
  const miles = option.distanceMi < 1 ? "Under a mile away" : `${option.distanceMi.toFixed(1)} mi away`;

  async function send() {
    if (!option) return;
    setPhase("sending");
    setError(null);
    try {
      const res = await fetch("/api/connections/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: option.providerId,
          providerName: option.name,
          providerSlug: option.slug,
          intentData: { careRecipient: null, careType: null, urgency: null },
          formData: { fullName: "", phone: "", message: "" },
          session_id: getOrCreateSessionId(),
          visit_id: getOrCreateVisitId(),
          entry_point: "next_best_option",
          from_connection_id: connectionId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Could not send your request.");
      window.dispatchEvent(new CustomEvent("olera:connection-created"));
      setPhase("sent");
    } catch (err) {
      setPhase("open");
      setError(err instanceof Error ? err.message : "Could not send your request.");
    }
  }

  return (
    <div className="mt-5 border-t border-gray-100 pt-4">
      {phase === "ask" && (
        <div className="flex items-start justify-between gap-3">
          <p className="text-[14px] leading-snug text-gray-600">
            Sent to {providerName}. Would you like to see the next best option nearby?
          </p>
          <button
            type="button"
            onClick={() => {
              setPhase("open");
              // Recorded for the funnel only; the card opens either way.
              fetch("/api/connections/next-best-option", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ connectionId }),
              }).catch(() => {});
            }}
            className="shrink-0 rounded-lg px-3 py-1.5 text-[14px] font-semibold text-primary-700 hover:bg-primary-50 transition-colors"
          >
            Show me
          </button>
        </div>
      )}

      {phase !== "ask" && (
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-gray-500">Next best option nearby</p>
          <a
            href={`/provider/${option.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 block text-[16px] font-semibold text-gray-900 hover:underline"
          >
            {option.name}
          </a>
          <p className="mt-0.5 text-[13px] text-gray-500">
            {[place, miles].filter(Boolean).join(" · ")}
            {option.rating !== null && (
              <>
                {" · "}
                <span className="text-gray-700">★ {option.rating.toFixed(1)}</span>
                {option.reviewCount ? ` (${option.reviewCount})` : ""}
              </>
            )}
          </p>

          {phase === "sent" ? (
            <p className="mt-3 flex items-center gap-2 text-[14px] font-medium text-emerald-700">
              <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Sent. They&apos;ll get the same details you just shared.
            </p>
          ) : (
            <>
              <button
                type="button"
                onClick={send}
                disabled={phase === "sending"}
                className="mt-3 w-full rounded-xl border-2 border-primary-600 py-2.5 text-[15px] font-semibold text-primary-700 hover:bg-primary-50 disabled:opacity-60 transition-colors"
              >
                {phase === "sending" ? "Sending…" : "Send my request to them too"}
              </button>
              {error && <p className="mt-2 text-[13px] text-red-600">{error} Please try again.</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

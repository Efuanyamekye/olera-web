"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trackHubClick, type HubState } from "./hub-links";

/**
 * "Use my location": asks the server which state the visitor's connection is
 * in (Vercel's IP region, no browser permission prompt) and opens that state.
 * When the region is unknown it says so and leaves the map and list to do the
 * job.
 */
export function LocateButton({ states, variant }: { states: HubState[]; variant: "pill" | "link" }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "busy" | "missed">("idle");

  async function locate() {
    trackHubClick("hub_locate");
    setStatus("busy");
    try {
      const res = await fetch("/api/geo/region", { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as { region?: string | null };
      const match = body.region ? states.find((s) => s.abbreviation === body.region) : undefined;
      if (match) {
        router.push(`/benefits/${match.id}`);
        return;
      }
    } catch {
      // fall through to the message below
    }
    setStatus("missed");
  }

  const pin = (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-primary-700" fill="currentColor">
      <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
    </svg>
  );

  return (
    <div className={variant === "pill" ? "flex flex-col items-center gap-2" : "flex flex-col gap-1"}>
      <button
        type="button"
        onClick={locate}
        disabled={status === "busy"}
        className={
          variant === "pill"
            ? "inline-flex min-w-[300px] items-center justify-center gap-2.5 rounded-full border border-gray-200 bg-white px-7 py-4 text-[17px] font-semibold text-gray-900 shadow-[0_6px_18px_rgba(0,0,0,0.10)] transition-shadow hover:shadow-[0_8px_24px_rgba(0,0,0,0.14)] disabled:opacity-70"
            : "inline-flex min-h-[44px] items-center gap-2 self-start text-[15px] font-semibold text-primary-800 disabled:opacity-70"
        }
      >
        {pin}
        {status === "busy" ? "Finding your state…" : "Use my location"}
      </button>
      {status === "missed" && (
        <p className="text-sm text-gray-600" role="status">
          We couldn&apos;t tell which state you&apos;re in. Pick it below.
        </p>
      )}
    </div>
  );
}

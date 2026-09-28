"use client";

/**
 * Switch for the benefits text companion test. Three modes, stepped on
 * purpose because this test texts people:
 *   Off       nothing happens.
 *   Practice  nothing sends; what the companion would have sent is saved on
 *             each family's profile for a person to read.
 *   Live      the chosen share of new phone-givers get the companion.
 * Live is locked until the fast replies and follow-ups ship.
 */

import { useEffect, useState } from "react";

type Mode = "off" | "practice" | "live";

const MODES: { key: Mode; title: string; sub: string }[] = [
  { key: "off", title: "Off", sub: "Nothing happens. Everyone gets today's texts." },
  { key: "practice", title: "Practice", sub: "Nothing sends. What it would have said is saved on each family for review." },
  { key: "live", title: "Live", sub: "This share of families who give a phone number get the companion." },
];

export default function BenefitsCompanionDial() {
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<Mode>("off");
  const [pct, setPct] = useState(10);
  const [saved, setSaved] = useState<{ mode: Mode; pct: number }>({ mode: "off", pct: 0 });
  const [liveReady, setLiveReady] = useState(false);
  const [version, setVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/analytics/benefits-companion", { cache: "no-store" })
      .then(async (r) => {
        if (cancelled) return;
        const data = r.ok ? await r.json().catch(() => null) : null;
        if (!data) {
          setFeedback({ kind: "err", msg: `Couldn't load the current setting (${r.status}). Try refreshing.` });
        } else {
          const m = (data.mode as Mode) || "off";
          setMode(m);
          if (m === "live") setPct(data.companionPct);
          setSaved({ mode: m, pct: data.companionPct ?? 0 });
          setLiveReady(!!data.liveReady);
          setVersion(typeof data.version === "number" ? data.version : 0);
        }
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setFeedback({ kind: "err", msg: "Network error loading the setting. Try refreshing." });
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = mode !== saved.mode || (mode === "live" && pct !== saved.pct);
  const canSave = loaded && dirty && !saving && (mode !== "live" || liveReady);

  const save = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/analytics/benefits-companion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, companionPct: mode === "live" ? pct : 0 }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setFeedback({ kind: "err", msg: body?.error || `Save failed (${res.status})` });
      } else {
        setSaved({ mode: body.mode, pct: body.companionPct });
        setVersion(body.version);
        setFeedback({
          kind: "ok",
          msg:
            body.mode === "off"
              ? "Saved. The companion is off."
              : body.mode === "practice"
                ? "Saved. Practice mode is on. Nothing will send."
                : `Saved. ${body.companionPct}% of new phone-givers get the companion.`,
        });
      }
    } catch {
      setFeedback({ kind: "err", msg: "Network error. Try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pt-2">
      <div className="flex items-baseline justify-between mb-1">
        <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Benefits text companion</div>
        <div className="text-[11px] text-gray-400 tabular-nums">v{version}</div>
      </div>
      <p className="text-[11px] text-gray-400 mb-3">
        A text conversation that starts the minute a family gives their number in the program-page card. It gives the number to call and asks if the need is urgent.
      </p>
      <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        {MODES.map((m) => {
          const locked = m.key === "live" && !liveReady;
          return (
            <label
              key={m.key}
              className={`flex flex-col gap-1 rounded-lg border px-3 py-2 ${
                mode === m.key ? "border-gray-900 bg-white" : "border-gray-200 bg-white"
              } ${locked ? "opacity-60" : "cursor-pointer"}`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  id={`companion-mode-${m.key}`}
                  name="companion-mode"
                  checked={mode === m.key}
                  disabled={!loaded || saving || locked}
                  onChange={() => setMode(m.key)}
                />
                <span className="text-[11px] font-medium text-gray-700">{m.title}</span>
              </span>
              <span className="text-[10px] text-gray-400 leading-tight">
                {locked ? "Locked until the fast replies and follow-ups ship." : m.sub}
              </span>
              {m.key === "live" && mode === "live" && !locked && (
                <div className="flex items-baseline gap-1 mt-1">
                  <input
                    type="number"
                    id="companion-pct"
                    min={1}
                    max={50}
                    step={1}
                    value={pct}
                    disabled={saving}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      if (!Number.isNaN(n)) setPct(Math.max(1, Math.min(50, n)));
                    }}
                    className="w-16 text-right tabular-nums text-base font-medium text-gray-900 bg-transparent border-b border-gray-200 focus:border-gray-900 focus:outline-none"
                  />
                  <span className="text-xs text-gray-400">% of families</span>
                </div>
              )}
            </label>
          );
        })}
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
            canSave ? "bg-gray-900 text-white hover:bg-gray-800" : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {feedback && (
          <span className={`text-[11px] ${feedback.kind === "ok" ? "text-emerald-700" : "text-rose-700"}`}>
            {feedback.msg}
          </span>
        )}
      </div>
    </div>
  );
}

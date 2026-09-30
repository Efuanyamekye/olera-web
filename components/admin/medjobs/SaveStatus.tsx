"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Whether the drawer you are looking at has your work in it.
 *
 * Autosave was introduced to take a button off the screen, and it took the
 * answer to that question with it. On 30 September two people described the
 * same thing independently: you type, you cannot tell whether it landed, and
 * once in a while it plainly did not. The answer is not to bring the button
 * back. A button per field is more clicks for the same work, and it does not
 * even answer the question, because the field you are not looking at is the
 * one you are unsure about.
 *
 * One line per drawer answers it: saving, saved and when, or not saved and
 * why. It is the pattern every editor people already use has settled on, for
 * the same reason.
 */
export type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "failed"; message: string };

export const IDLE: SaveState = { kind: "idle" };

/**
 * The state, and the three transitions a caller needs.
 *
 * `saving()` hands back the finisher rather than exposing a setter, so a slow
 * request that resolves after a later, faster one cannot overwrite the newer
 * result with its own. Out-of-order responses are how a status line ends up
 * reading "saved" over the top of a failure.
 */
export function useSaveState() {
  const [state, setState] = useState<SaveState>(IDLE);
  const seq = useRef(0);

  const saving = useCallback(() => {
    const mine = ++seq.current;
    setState({ kind: "saving" });
    return {
      saved: () => {
        if (seq.current === mine) setState({ kind: "saved", at: Date.now() });
      },
      failed: (message: string) => {
        if (seq.current === mine) setState({ kind: "failed", message });
      },
    };
  }, []);

  const reset = useCallback(() => {
    seq.current++;
    setState(IDLE);
  }, []);

  return { state, saving, reset };
}

const clock = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/**
 * The line itself.
 *
 * Idle renders nothing. A drawer opened and not yet edited has nothing to
 * report, and a permanent "Saved" on it would be a claim about work nobody
 * has done.
 */
export default function SaveStatus({ state }: { state: SaveState }) {
  if (state.kind === "idle") return null;

  if (state.kind === "saving") {
    return (
      <span className="shrink-0 text-[11.5px] text-gray-400" aria-live="polite">
        Saving&hellip;
      </span>
    );
  }

  if (state.kind === "saved") {
    return (
      <span className="shrink-0 text-[11.5px] font-medium text-success-700" aria-live="polite">
        Saved {clock(state.at)}
      </span>
    );
  }

  return (
    <span
      className="shrink-0 text-[11.5px] font-semibold text-error-700"
      aria-live="assertive"
      title={state.message}
    >
      Not saved
    </span>
  );
}

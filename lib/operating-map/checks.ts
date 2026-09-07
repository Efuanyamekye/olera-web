/**
 * Relationships between nodes that have to hold if the map is counting
 * correctly.
 *
 * These are not style rules — each one is a statement about the funnel that
 * cannot be false unless something is wrong. A visitor cannot be more
 * numerous than the pages they viewed. A parent has to equal its parts. When
 * one breaks, the map says so rather than presenting a confident wrong
 * number, which is the failure mode worth spending code on: a number nobody
 * questions is more dangerous than a missing one.
 *
 * Checks skip themselves when an input is missing, so an unavailable node
 * reports as unavailable rather than manufacturing a failure.
 *
 * These are not rendered on the map. They ride along in the metrics response
 * under `checks`, to be read on demand rather than shown to everyone who
 * opens the page — an audit is something you run, not something you sit
 * under while trying to read a number.
 */

export interface NodeValues {
  [nodeId: string]: number | null | undefined;
}

export interface MapCheck {
  id: string;
  /** What is being asserted, in the language the map itself uses. */
  label: string;
  ok: boolean;
  /** Only set when the check fails: the numbers that did not line up. */
  detail?: string;
}

const n = (v: number | null | undefined): number | null =>
  typeof v === "number" ? v : null;

export interface CheckInputs {
  /** CR4's provider + editorial + benefits, summed by the caller. */
  cr4PartsSum?: number;
  /** Claim records that point at a provider not in the directory. */
  cp1OrphanedClaims?: number;
  /** CP1's unclaimed half — the set CP2 is drawn from. */
  cp1Unclaimed?: number;
  /** Inquiries raised — the set TB1's answered count is drawn from. */
  inquiriesRaised?: number;
  /** Interviews proposed — the set TC1's confirmed count is drawn from. */
  interviewsProposed?: number;
}

export function runChecks(values: NodeValues, inputs: CheckInputs = {}): MapCheck[] {
  const checks: MapCheck[] = [];

  const cr6 = n(values.cr6);
  const cr6a = n(values.cr6a);
  const cr6b = n(values.cr6b);
  const cr6c = n(values.cr6c);
  if (cr6 !== null && cr6a !== null && cr6b !== null && cr6c !== null) {
    const sum = cr6a + cr6b + cr6c;
    checks.push({
      id: "cr6-parts",
      label: "CTAs completed equals its three parts",
      ok: cr6 === sum,
      detail: cr6 === sum ? undefined : `CR6 is ${cr6}, its parts add to ${sum}`,
    });
  }

  const cr4 = n(values.cr4);
  // One visitor produces at least one page view, so no source can have more
  // visitors than there were views over the same window — and the three
  // together cannot either, since they are disjoint slices of the same rows.
  for (const [id, label] of [
    ["cr1", "Direct visitors"],
    ["cr2", "Organic visitors"],
    ["cr3", "Paid ad visitors"],
  ] as const) {
    const v = n(values[id]);
    if (v !== null && cr4 !== null) {
      checks.push({
        id: `${id}-under-cr4`,
        label: `${label} do not exceed page visits`,
        ok: v <= cr4,
        detail: v <= cr4 ? undefined : `${id.toUpperCase()} is ${v}, CR4 is ${cr4}`,
      });
    }
  }

  const cr1 = n(values.cr1);
  const cr2 = n(values.cr2);
  const cr3 = n(values.cr3);
  if (cr1 !== null && cr2 !== null && cr3 !== null && cr4 !== null) {
    const sources = cr1 + cr2 + cr3;
    checks.push({
      id: "sources-under-cr4",
      label: "Direct plus organic plus paid do not exceed page visits",
      ok: sources <= cr4,
      detail:
        sources <= cr4 ? undefined : `The three sources add to ${sources}, CR4 is ${cr4}`,
    });
  }

  if (typeof inputs.cr4PartsSum === "number" && n(values.cr4) !== null) {
    const total = n(values.cr4) as number;
    checks.push({
      id: "cr4-parts",
      label: "Page visits equals provider plus editorial plus benefits",
      ok: total === inputs.cr4PartsSum,
      detail:
        total === inputs.cr4PartsSum
          ? undefined
          : `CR4 is ${total}, its parts add to ${inputs.cr4PartsSum}`,
    });
  }

  const cp2 = n(values.cp2);

  if (typeof inputs.cp1OrphanedClaims === "number") {
    // CP1's split is a subtraction, so "parts add to the total" would be
    // true by construction and prove nothing. This asks the question that
    // can actually be false: does every claim point at a listed provider?
    checks.push({
      id: "cp1-claims-resolve",
      label: "Every claimed profile matches a listed provider",
      ok: inputs.cp1OrphanedClaims === 0,
      detail:
        inputs.cp1OrphanedClaims === 0
          ? undefined
          : `${inputs.cp1OrphanedClaims} claim${inputs.cp1OrphanedClaims === 1 ? "" : "s"} point at a provider not in the directory`,
    });
  }

  if (cp2 !== null && typeof inputs.cp1Unclaimed === "number") {
    // CP2 counts unclaimed providers, so it cannot exceed how many there are.
    checks.push({
      id: "cp2-under-unclaimed",
      label: "Providers in outreach do not exceed unclaimed providers",
      ok: cp2 <= inputs.cp1Unclaimed,
      detail:
        cp2 <= inputs.cp1Unclaimed
          ? undefined
          : `CP2 is ${cp2}, unclaimed is ${inputs.cp1Unclaimed}`,
    });
  }

  // The "matched" step was taken off the map, so these compare against the
  // raised/proposed totals passed in rather than a node above them.
  for (const [child, total, label] of [
    ["tb1", inputs.inquiriesRaised, "Connections confirmed do not exceed inquiries raised"],
    ["tc1", inputs.interviewsProposed, "Interviews confirmed do not exceed interviews proposed"],
  ] as const) {
    const c = n(values[child]);
    if (c !== null && typeof total === "number") {
      checks.push({
        id: `${child}-under-source`,
        label,
        ok: c <= total,
        detail: c <= total ? undefined : `${child.toUpperCase()} is ${c}, the source set is ${total}`,
      });
    }
  }

  const tc1 = n(values.tc1);
  const tc2 = n(values.tc2);
  if (tc1 !== null && tc2 !== null) {
    checks.push({
      id: "tc2-under-tc1",
      label: "Hires do not exceed confirmed interviews",
      ok: tc2 <= tc1,
      detail: tc2 <= tc1 ? undefined : `TC2 is ${tc2}, TC1 is ${tc1}`,
    });
  }

  const cw1 = n(values.cw1);
  const cw2 = n(values.cw2);
  if (cw1 !== null && cw2 !== null && cw1 === 0) {
    // Advisors hang off campuses, so contacts with no campus behind them
    // would mean the join is broken rather than the pipeline being empty.
    checks.push({
      id: "cw2-needs-cw1",
      label: "Advisors only exist where a university is listed",
      ok: cw2 === 0,
      detail: cw2 === 0 ? undefined : `CW2 is ${cw2} with no universities listed`,
    });
  }

  if (cr6 !== null && cr4 !== null) {
    checks.push({
      id: "cr6-under-cr4",
      label: "CTAs completed do not exceed page visits",
      ok: cr6 <= cr4,
      detail: cr6 <= cr4 ? undefined : `CR6 is ${cr6}, CR4 is ${cr4}`,
    });
  }

  return checks;
}

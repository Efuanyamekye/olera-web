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
  /** Page visits' provider + editorial + benefits, summed by the caller. */
  visitsPartsSum?: number;
  /** Claim records that point at a provider not in the directory. */
  cp1OrphanedClaims?: number;
  /** CP1's unclaimed half — the set CP2 is drawn from. */
  cp1Unclaimed?: number;
  /** TRAFFIC's ten channels, summed by the caller. */
  trafficChannelSum?: number;
  /** Inquiries raised — the set O1's answered count is drawn from. */
  inquiriesRaised?: number;
  /** Interviews proposed — the set O4's confirmed count is drawn from. */
  interviewsProposed?: number;
}

export function runChecks(values: NodeValues, inputs: CheckInputs = {}): MapCheck[] {
  const checks: MapCheck[] = [];

  const cr1 = n(values.cr1);
  const cr1b = n(values.cr1b);
  const cr1c = n(values.cr1c);
  if (cr1 !== null && cr1b !== null && cr1c !== null) {
    // Questions (S1a) are deliberately not in this sum. CR1 counts the two
    // actions that leave a record to work, and asserting against all three
    // would fail every week a family asked a question.
    const sum = cr1b + cr1c;
    checks.push({
      id: "cr1-parts",
      label: "Families engaged equals connect requests plus benefits assessments",
      ok: cr1 === sum,
      detail: cr1 === sum ? undefined : `CR1 is ${cr1}, its parts add to ${sum}`,
    });
  }

  const traffic = n(values.traffic);
  const visits = n(values.visits);
  if (traffic !== null && visits !== null) {
    // One visitor produces at least one page view, so visitors can never
    // exceed views over the same window.
    checks.push({
      id: "traffic-under-visits",
      label: "Visitors do not exceed page visits",
      ok: traffic <= visits,
      detail:
        traffic <= visits ? undefined : `Traffic is ${traffic}, page visits is ${visits}`,
    });
  }

  if (traffic !== null && typeof inputs.trafficChannelSum === "number") {
    // The ten channels are meant to be exhaustive. If they do not add to the
    // total, a visitor fell through the classifier — a bug in it, not a gap
    // in the data.
    checks.push({
      id: "traffic-channels-complete",
      label: "The ten channels account for every visitor",
      ok: traffic === inputs.trafficChannelSum,
      detail:
        traffic === inputs.trafficChannelSum
          ? undefined
          : `TRAFFIC is ${traffic}, its channels add to ${inputs.trafficChannelSum}`,
    });
  }

  if (typeof inputs.visitsPartsSum === "number" && n(values.visits) !== null) {
    const total = n(values.visits) as number;
    checks.push({
      id: "visits-parts",
      label: "Page visits equals provider plus editorial plus benefits",
      ok: total === inputs.visitsPartsSum,
      detail:
        total === inputs.visitsPartsSum
          ? undefined
          : `Page visits is ${total}, its parts add to ${inputs.visitsPartsSum}`,
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
    ["o1", inputs.inquiriesRaised, "Connections confirmed do not exceed inquiries raised"],
    ["o4", inputs.interviewsProposed, "Interviews confirmed do not exceed interviews proposed"],
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

  const o4 = n(values.o4);
  const o5 = n(values.o5);
  if (o4 !== null && o5 !== null) {
    checks.push({
      id: "o5-under-o4",
      label: "Hires do not exceed confirmed interviews",
      ok: o5 <= o4,
      detail: o5 <= o4 ? undefined : `O5 is ${o5}, O4 is ${o4}`,
    });
  }

  const cw1 = n(values.cw1);
  const cw2 = n(values.cw2);
  if (cw1 !== null && cw2 !== null && cw1 === 0) {
    // Advisors hang off campuses, so contacts with no campus behind them
    // would mean the join is broken rather than the pipeline being empty.
    checks.push({
      id: "cw2-needs-cw1",
      label: "Advisors only exist where a university is targeted",
      ok: cw2 === 0,
      detail: cw2 === 0 ? undefined : `CW2 is ${cw2} with no universities targeted`,
    });
  }

  if (cr1 !== null && visits !== null) {
    checks.push({
      id: "engaged-under-visits",
      label: "Families engaged do not exceed page visits",
      ok: cr1 <= visits,
      detail: cr1 <= visits ? undefined : `CR1 is ${cr1}, page visits is ${visits}`,
    });
  }

  return checks;
}

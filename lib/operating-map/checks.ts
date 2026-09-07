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
  p1OrphanedClaims?: number;
  /** P1's unclaimed half — the set P2 is drawn from. */
  p1Unclaimed?: number;
  /** TRAFFIC's ten channels, summed by the caller. */
  trafficChannelSum?: number;
  /** Inquiries raised — the set SP1's answered count is drawn from. */
  inquiriesRaised?: number;
  /** Interviews proposed — the set PW1's confirmed count is drawn from. */
  interviewsProposed?: number;
}

export function runChecks(values: NodeValues, inputs: CheckInputs = {}): MapCheck[] {
  const checks: MapCheck[] = [];

  const s1 = n(values.s1);
  const s1b = n(values.s1b);
  const s1c = n(values.s1c);
  if (s1 !== null && s1b !== null && s1c !== null) {
    // Questions (S1a) are deliberately not in this sum. S1 counts the two
    // actions that leave a record to work, and asserting against all three
    // would fail every week a family asked a question.
    const sum = s1b + s1c;
    checks.push({
      id: "s1-parts",
      label: "Families engaged equals connect requests plus benefits assessments",
      ok: s1 === sum,
      detail: s1 === sum ? undefined : `S1 is ${s1}, its parts add to ${sum}`,
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

  const p2 = n(values.p2);

  if (typeof inputs.p1OrphanedClaims === "number") {
    // P1's split is a subtraction, so "parts add to the total" would be
    // true by construction and prove nothing. This asks the question that
    // can actually be false: does every claim point at a listed provider?
    checks.push({
      id: "p1-claims-resolve",
      label: "Every claimed profile matches a listed provider",
      ok: inputs.p1OrphanedClaims === 0,
      detail:
        inputs.p1OrphanedClaims === 0
          ? undefined
          : `${inputs.p1OrphanedClaims} claim${inputs.p1OrphanedClaims === 1 ? "" : "s"} point at a provider not in the directory`,
    });
  }

  if (p2 !== null && typeof inputs.p1Unclaimed === "number") {
    // P2 counts unclaimed providers, so it cannot exceed how many there are.
    checks.push({
      id: "p2-under-unclaimed",
      label: "Providers in outreach do not exceed unclaimed providers",
      ok: p2 <= inputs.p1Unclaimed,
      detail:
        p2 <= inputs.p1Unclaimed
          ? undefined
          : `P2 is ${p2}, unclaimed is ${inputs.p1Unclaimed}`,
    });
  }

  // The "matched" step was taken off the map, so these compare against the
  // raised/proposed totals passed in rather than a node above them.
  for (const [child, total, label] of [
    ["sp1", inputs.inquiriesRaised, "Connections confirmed do not exceed inquiries raised"],
    ["pw1", inputs.interviewsProposed, "Interviews confirmed do not exceed interviews proposed"],
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

  const pw1 = n(values.pw1);
  const pw2 = n(values.pw2);
  if (pw1 !== null && pw2 !== null) {
    checks.push({
      id: "pw2-under-pw1",
      label: "Hires do not exceed confirmed interviews",
      ok: pw2 <= pw1,
      detail: pw2 <= pw1 ? undefined : `PW2 is ${pw2}, PW1 is ${pw1}`,
    });
  }

  const w1 = n(values.w1);
  const w2 = n(values.w2);
  if (w1 !== null && w2 !== null && w1 === 0) {
    // Advisors hang off campuses, so contacts with no campus behind them
    // would mean the join is broken rather than the pipeline being empty.
    checks.push({
      id: "w2-needs-w1",
      label: "Advisors only exist where a university is targeted",
      ok: w2 === 0,
      detail: w2 === 0 ? undefined : `W2 is ${w2} with no universities targeted`,
    });
  }

  if (s1 !== null && visits !== null) {
    checks.push({
      id: "engaged-under-visits",
      label: "Families engaged do not exceed page visits",
      ok: s1 <= visits,
      detail: s1 <= visits ? undefined : `S1 is ${s1}, page visits is ${visits}`,
    });
  }

  return checks;
}

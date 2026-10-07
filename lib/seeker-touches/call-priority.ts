import type { SeekerRelationshipRow } from "./types";

/** Stated intake facts only. Unknown funding is never inferred to be private pay. */
export function callSignals(row: Pick<SeekerRelationshipRow, "timeline" | "payment">) {
  const normalize = (value: string) => value.trim().toLowerCase().replace(/[ _-]+/g, " ");
  return {
    asap: ["immediate", "asap", "this week"].includes(normalize(row.timeline ?? "")),
    privatePay: row.payment.some((value) => normalize(value) === "private pay"),
  };
}

/** Applied only inside Call them. Keep urgent needs and unanswered replies first. */
export function compareCallPriority(a: SeekerRelationshipRow, b: SeekerRelationshipRow): number {
  const waiting = (r: SeekerRelationshipRow) => Boolean(r.benefits?.urgent_at || r.flags.includes("awaiting_reply"));
  const waitingOrder = Number(waiting(b)) - Number(waiting(a));
  if (waitingOrder) return waitingOrder;
  const x = callSignals(a);
  const y = callSignals(b);
  // Stable sort retains the existing newest-first order when facts are equal.
  return Number(y.asap) - Number(x.asap) || Number(y.privatePay) - Number(x.privatePay);
}

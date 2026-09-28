/**
 * Does this taken offer still hold the family? Not once the family was moved
 * on: the follow-up ladder releases a provider who never called (the offer's
 * outcome becomes "no_contact", the lead's claim is cleared), and a later take
 * by another agency replaces the claim. Rudy is the first case: Assisting
 * Hands took him on 20 Sep, never called, and was released to Cambridge; their
 * inbox kept showing him as theirs until this check.
 */
export function offerStillHolds(
  o: { id: string; accepted_at: string | null; outcome?: string | null },
  lead: { accepted_offer_id?: string | null },
): boolean {
  // "no_contact": released by the follow-up ladder. "moved": moved on by the
  // team from the case page (move.server.ts).
  if (!o.accepted_at || o.outcome === "no_contact" || o.outcome === "moved") return false;
  return !lead.accepted_offer_id || lead.accepted_offer_id === o.id;
}

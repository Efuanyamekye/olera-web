/**
 * Decision-maker readers — the single source of truth for pulling emailable
 * decision makers off an outreach row's research_data.
 *
 * There are two stores for historical reasons:
 *   - `research_data.decision_makers` (PLURAL array) — the current UI
 *     (SnapshotCard's SpecificContactsSection, researchKey="decision_makers").
 *     The role picker value is stored in each entry's `title`.
 *   - `research_data.decision_maker` (SINGULAR object) — the legacy slot,
 *     still present on older rows.
 *
 * Readers (the launch gate, the Smartlead preview fan-out) must consider BOTH
 * so a provider with a decision-maker email — but no general email — can still
 * launch, and so the launch modal previews every individual. Deduped by
 * lowercased email; `unavailable` and empty-email entries are skipped.
 */

export interface DecisionMakerRecipient {
  email: string;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
}

interface RawDecisionMaker {
  email?: string | null;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  role?: string | null;
  /** The add-contact UI stores the role-picker value in `title`. */
  title?: string | null;
  unavailable?: boolean | null;
}

const str = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
};

export function decisionMakerEmailRecipients(
  researchData: Record<string, unknown> | null | undefined,
): DecisionMakerRecipient[] {
  const out: DecisionMakerRecipient[] = [];
  const seen = new Set<string>();

  const push = (d: RawDecisionMaker | null | undefined) => {
    if (!d || typeof d !== "object") return;
    if (d.unavailable === true) return;
    const email = str(d.email);
    if (!email) return;
    const lc = email.toLowerCase();
    if (seen.has(lc)) return;
    seen.add(lc);
    out.push({
      email,
      name: str(d.name),
      first_name: str(d.first_name),
      last_name: str(d.last_name),
      // The role lives in `role` on the legacy slot and in `title` on the
      // plural SpecificContactsSection entries.
      role: str(d.role) ?? str(d.title),
    });
  };

  const rd = researchData ?? {};
  // Plural (current source of truth) first, then the legacy singular slot.
  const plural = (rd as { decision_makers?: unknown }).decision_makers;
  if (Array.isArray(plural)) {
    for (const d of plural) push(d as RawDecisionMaker);
  }
  push((rd as { decision_maker?: RawDecisionMaker }).decision_maker);

  return out;
}

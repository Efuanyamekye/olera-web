/**
 * Offline checks for Cortex's lean scan: mode, evidence aliases, and the
 * mapping from one lean answer onto the investigation and agenda shapes the
 * rest of the scan persists. No model call, no database.
 *
 *   npx tsx scripts/check-war-room-lean.ts
 */
import assert from "node:assert/strict";
import {
  leanAgendaBlocker,
  mapLeanOutput,
  unaliasIds,
  unaliasLeanOutput,
  warRoomScanMode,
  type LeanCondition,
  type LeanScanOutput,
} from "../lib/war-room/lean-scan";

// --- Mode: lean unless someone asks for full, read from the env once per run.
assert.equal(warRoomScanMode(undefined), "lean");
assert.equal(warRoomScanMode("full"), "full");
assert.equal(warRoomScanMode(" FULL "), "full");
assert.equal(warRoomScanMode("anything else"), "lean");
console.log("mode checks passed");

// --- Aliases: short ids in the prompt, real catalog ids everywhere after.
const aliases = { "external:s1": "external:slack:8f2c4a1e-1111-4a5b-9c3d-222233334444" };
assert.deepEqual(unaliasIds(["external:s1", "metric:paying"], aliases), ["external:slack:8f2c4a1e-1111-4a5b-9c3d-222233334444", "metric:paying"]);
assert.deepEqual(unaliasIds(undefined, aliases), []);

const condition = (fingerprint: string, extra: Partial<LeanCondition> = {}): LeanCondition => ({
  fingerprint,
  priority: "providers",
  title: `Condition ${fingerprint}`,
  situation: "Something measurable is off.",
  whyItMatters: "It moves a priority.",
  unknowns: ["Which cohort is affected and why"],
  evidenceIds: ["metric:paying", "external:s1"],
  weight: { impact: "medium", urgency: "monitor", strategicFit: "adjacent" },
  disposition: { disposition: "investigate", reasonCode: "needs_evidence", reason: "Open." },
  nextProbe: "none",
  ...extra,
});
const output = (conditions: LeanCondition[], agenda: Partial<LeanScanOutput["agenda"]> = {}): LeanScanOutput => ({
  priorityReads: [{ priority: "providers", status: "watch", read: "Holding.", evidenceIds: ["external:s1"] } as never],
  conditions,
  agenda: { kind: "none", fingerprint: "", reason: "", alternatives: [], existingCapabilities: [], capabilityEvidenceIds: [], hypotheses: [], ...agenda },
  companyRead: { summary: "", stance: "steady" as never, unresolvedQuestions: [] },
  outcomes: [],
});
const unaliased = unaliasLeanOutput(output([condition("contact-gap-blocks-claims")]), aliases);
assert.deepEqual(unaliased.conditions[0].evidenceIds, ["metric:paying", "external:slack:8f2c4a1e-1111-4a5b-9c3d-222233334444"]);
assert.deepEqual(unaliased.priorityReads[0].evidenceIds, ["external:slack:8f2c4a1e-1111-4a5b-9c3d-222233334444"]);
console.log("alias checks passed");

// --- Mapping.
const valid = new Set(["metric:paying", "external:slack:8f2c4a1e-1111-4a5b-9c3d-222233334444", "capability:claim-flow", "metric:backlog"]);

// Invented evidence ids are dropped; the model cannot cite what the pack never held.
{
  const mapped = mapLeanOutput(unaliasLeanOutput(output([condition("contact-gap-blocks-claims", { evidenceIds: ["metric:paying", "metric:made-up"] })]), aliases), [], valid);
  assert.deepEqual(mapped.dossiers[0].evidenceIds, ["metric:paying"]);
}

// A repeated fingerprint is one condition, and at most six are kept.
{
  const many = [condition("support-backlog-too-high"), condition("support-backlog-too-high"), ...Array.from({ length: 7 }, (_, i) => condition(`condition-number-${i + 1}`))];
  const mapped = mapLeanOutput(output(many), [], valid);
  assert.equal(new Set(mapped.dossiers.map((d) => d.fingerprint)).size, mapped.dossiers.length, "no duplicate fingerprints");
  assert.ok(mapped.dossiers.length <= 6);
}

// A condition seen before keeps what a richer pass worked out: alternatives, capabilities, cause.
{
  const prior = {
    fingerprint: "contact-gap-blocks-claims",
    domain: "growth",
    likely_cause: "Most question-holding providers have no usable email.",
    existing_capabilities: ["The claim flow and the provider outreach sequence already exist."],
    options: [{ actionKind: "code", title: "A", logic: "a", downside: "a" }, { actionKind: "code", title: "B", logic: "b", downside: "b" }],
    evidence: [{ id: "capability:claim-flow" }],
  } as never;
  const mapped = mapLeanOutput(output([condition("contact-gap-blocks-claims")]), [prior], valid);
  const draft = mapped.dossiers[0];
  assert.equal(draft.likelyCause, "Most question-holding providers have no usable email.");
  assert.equal(draft.options.length, 2, "alternatives survive a lean scan that did not restate them");
  assert.deepEqual(draft.capabilityEvidenceIds, ["capability:claim-flow"]);
}

// No agenda is the normal answer.
assert.equal(mapLeanOutput(output([condition("support-backlog-too-high")]), [], valid).agenda, null);

// A nomination that cannot pass the gate is skipped before a draft is paid for.
{
  const mapped = mapLeanOutput(output([condition("support-backlog-too-high")], { kind: "decision", fingerprint: "support-backlog-too-high", reason: "Now." }), [], valid);
  assert.equal(mapped.agenda, null);
  assert.match(mapped.agendaSkipped ?? "", /not drafted: the condition is not high-impact and central/);
}
assert.match(leanAgendaBlocker(undefined, "decision") ?? "", /not one of this scan's conditions/);

// A nomination that clears the cheap preconditions becomes the agenda item and routes as a decision.
{
  const strong = condition("sole-payer-renewal-at-risk", {
    priority: "crp",
    weight: { impact: "high", urgency: "now", strategicFit: "central" },
  });
  const mapped = mapLeanOutput(output([strong], {
    kind: "decision",
    fingerprint: "sole-payer-renewal-at-risk",
    reason: "Flight ends Oct 20.",
    alternatives: [
      { actionKind: "human_owner", title: "Call her this week", logic: "Relationship first.", downside: "Takes TJ's time." },
      { actionKind: "code", title: "Show her results page", logic: "Self-serve proof.", downside: "Slower." },
    ],
    existingCapabilities: ["Campaign results page already exists for every provider."],
    capabilityEvidenceIds: ["capability:claim-flow", "capability:invented"],
  }), [], valid);
  assert.deepEqual(mapped.agenda, { kind: "decision", fingerprint: "sole-payer-renewal-at-risk" });
  assert.equal(mapped.assessments[0].disposition, "agenda");
  assert.equal(mapped.dossiers[0].readiness, "decision_ready");
  assert.deepEqual(mapped.dossiers[0].capabilityEvidenceIds, ["capability:claim-flow"], "an invented capability id is dropped");
}
console.log("mapping checks passed");

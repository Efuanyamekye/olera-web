import type {
  WarRoomActionKind,
  WarRoomCompanyRead,
  WarRoomCompanyModel,
  WarRoomDomain,
  WarRoomProposalEvidence,
} from "@/lib/war-room/types";

export const WAR_ROOM_DOMAINS: WarRoomDomain[] = [
  "company", "customer", "provider", "growth", "revenue", "product",
  "content", "operations", "market", "data",
];

export const WAR_ROOM_ACTION_KINDS: WarRoomActionKind[] = [
  "code", "research", "operations", "business_development", "content", "decision",
];

// A probe kind is now the id of a probe the server can actually execute, not a
// free-form description of one. An investigation that plans a probe nobody can
// run is how every case stayed at low cause confidence forever.
export const WAR_ROOM_PROBE_KINDS = [
  "question_to_claim_conversion",
  "question_inventory_health",
  "provider_contactability",
  "traffic_by_page_family",
  "revenue_by_product",
  "support_backlog_composition",
  "none",
] as const;

export const DEFAULT_COMPANY_MODEL: WarRoomCompanyModel = {
  key: "olera",
  purpose: "Help families find and act on trustworthy senior-care options while building a durable, efficient company.",
  stage: "Early-stage marketplace proving repeatable family acquisition, provider participation, and revenue.",
  north_star: "More families successfully connect with appropriate care while Olera learns a repeatable, economically durable way to create that outcome.",
  current_priorities: [
    "Convert family demand into claimed provider pages, then into paid provider products",
    "Repair provider reachability so demand can be delivered to a provider at all",
    "Increase useful family outcomes",
    "Protect distribution resilience",
  ],
  strategic_bets: [
    "Provider pages",
    "Care-seeker questions as provider-acquisition demand",
    "Benefits guidance",
    "Editorial content",
    "Ad Boost and other provider revenue",
  ],
  constraints: [
    "Founder attention is scarce",
    "Company-wide revenue and cost data are not yet consolidated",
    "Some provider contact information is missing or stale",
    "Founder time spent answering care-seeker questions directly does not scale and is not the intended mechanism",
  ],
  guardrails: [
    "Protect families and providers",
    "Do not trade trust for short-term metrics",
    "No autonomous sends, spend, deployment, deletion, or production mutation",
    "Prefer reversible learning before expensive commitment",
  ],
  strategic_questions: [
    "Which acquisition loops are durable beyond Google?",
    "Where does family demand exceed reachable provider supply?",
    "Does question volume on a provider page actually convert that provider into a claim, controlling for page traffic?",
    "Which value can Olera reliably monetize?",
  ],
  updated_by: null,
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
};

/**
 * How Olera actually makes money, stated plainly so the agent stops inferring a
 * different business from raw counts. Without this the ten-lens sweep reads a
 * low answer rate as a customer-service failure, when unanswered questions are
 * the demand signal that pulls providers into claiming a page.
 */
export const WAR_ROOM_OPERATING_MECHANICS = {
  questionLoop: [
    "A care-seeker question on a provider page is provider-acquisition inventory, not a support ticket.",
    "The intended path is: question lands on a provider page, the provider is notified, the provider claims the page to respond, and a claimed provider can then be sold Ad Boost and other products.",
    "Only a small minority of askers leave an email, so answering a question is usually not a way to reach that family. Do not treat the answer rate as a customer-service metric or recommend that the founder answer questions personally.",
    "A low answer rate is therefore only a problem where it breaks the provider loop: questions on unreachable providers, questions on pages that do not resolve to a live directory row, or questions on already-claimed providers that cannot produce a new claim.",
  ],
  measurement: [
    "provider_questions.provider_id holds the directory slug. provider_activity.provider_id holds the canonical provider id. Any question-to-claim measurement must translate through olera-providers.slug.",
    "Ad Boost is the only consolidated revenue line. Absence of other revenue in the pack is not evidence that other revenue is zero.",
  ],
} as const;

/** Keep evidence IDs in attached evidence, never in the CEO-facing prose. */
export function cleanExecutiveText(value: string) {
  return value
    .replace(/\((?:metric|signal|comparison|growth|voice|source|decision|external|capability):[^)]+\)/gi, "")
    .replace(/\b(?:metric|signal|comparison|growth|voice|source|decision|external|capability):[a-z0-9_.:-]+\b/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

export type InvestigationDraft = {
  fingerprint: string;
  domain: WarRoomDomain;
  title: string;
  situation: string;
  whyItMatters: string;
  likelyCause: string;
  causeConfidence: "high" | "medium" | "low";
  existingCapabilities: string[];
  capabilityEvidenceIds: string[];
  unknowns: string[];
  hypotheses: string[];
  nextProbe: {
    kind: (typeof WAR_ROOM_PROBE_KINDS)[number];
    question: string;
    method: string;
    expectedInformationGain: string;
  } | null;
  resolutionCriteria: string[];
  options: Array<{
    actionKind: WarRoomActionKind;
    title: string;
    logic: string;
    downside: string;
  }>;
  evidenceIds: string[];
  counterEvidence: string;
  readiness: "investigating" | "watchlist" | "decision_ready";
  readinessReason: string;
  impact: "high" | "medium" | "low";
  urgency: "now" | "soon" | "monitor";
  strategicFit: "central" | "adjacent" | "peripheral";
  founderAttentionMinutes: number;
};

export type InvestigationAssessment = {
  fingerprint: string;
  disposition: "agenda" | "watchlist" | "investigate" | "drop";
  reasonCode: "agenda" | "needs_evidence" | "monitor" | "duplicate" | "resolved" | "contradicted" | "not_material";
  reason: string;
};

export type StrategicLensReview = {
  fingerprint: string;
  domain: WarRoomDomain;
  status: "clear" | "watch" | "investigate" | "decision_candidate";
  title: string;
  finding: string;
  whyItMatters: string;
  unresolvedQuestion: string;
  evidenceIds: string[];
  impact: "high" | "medium" | "low";
  urgency: "now" | "soon" | "monitor";
  strategicFit: "central" | "adjacent" | "peripheral";
};

export function requireCompleteStrategicLensCoverage(
  reviews: StrategicLensReview[],
  evidenceCatalog: WarRoomProposalEvidence[],
) {
  const counts = new Map<WarRoomDomain, number>(WAR_ROOM_DOMAINS.map((domain) => [domain, 0]));
  const validEvidenceIds = new Set(evidenceCatalog.map((item) => item.id));
  const unsupported: WarRoomDomain[] = [];
  for (const review of reviews) {
    if (WAR_ROOM_DOMAINS.includes(review.domain)) {
      counts.set(review.domain, (counts.get(review.domain) ?? 0) + 1);
      if (!(review.evidenceIds ?? []).some((id) => validEvidenceIds.has(id))) unsupported.push(review.domain);
    }
  }
  const missing = WAR_ROOM_DOMAINS.filter((domain) => counts.get(domain) === 0);
  const duplicates = WAR_ROOM_DOMAINS.filter((domain) => (counts.get(domain) ?? 0) > 1);
  if (reviews.length !== WAR_ROOM_DOMAINS.length || missing.length || duplicates.length || unsupported.length) {
    throw new Error(`war_room_incomplete_lens_coverage:missing=${missing.join(",") || "none"};duplicates=${duplicates.join(",") || "none"};unsupported=${[...new Set(unsupported)].join(",") || "none"}`);
  }
  return reviews;
}

export type CompanyReadDraft = WarRoomCompanyRead;

export type AgendaProposalDraft = {
  sourceInvestigationFingerprint: string;
  fingerprint: string;
  actionKind: WarRoomActionKind;
  domain: WarRoomDomain;
  title: string;
  finding: string;
  whyNow: string;
  proposedSolution: string;
  decisionRequired: string;
  whyBetterThanAlternatives: string;
  cheapestFalsification: string;
  existingCapabilities: string[];
  executionPlan: Array<{ label: string; detail: string }>;
  evidenceIds: string[];
  capabilityEvidenceIds: string[];
  counterEvidence: string;
  successMeasure: string;
  risk: string;
  rollbackPlan: string;
  confidence: "high" | "medium" | "low";
  impact: "high" | "medium" | "low";
  effort: "small" | "medium" | "large";
  // Who does it. Required for every non-code proposal: see the assigned-work
  // gate below. Null is legitimate only for `code`, where the executor is the
  // owner.
  assignedOwner: string | null;
  urgency: "now" | "soon" | "monitor";
  strategicFit: "central" | "adjacent" | "peripheral";
  reversibility: "high" | "medium" | "low";
  founderAttentionMinutes: number;
  evaluationWindowDays: number;
  adminHref: string | null;
};

function uniqueValid(ids: string[], validIds: Set<string>) {
  return [...new Set(ids.filter((id) => validIds.has(id)))];
}

function sourceFamily(evidence: WarRoomProposalEvidence) {
  const [family] = evidence.source.split(":");
  if (["Olera product data", "Olera period comparison", "Deterministic anomaly check", "Olera provider-contactability cohort"].includes(family)) return "olera-product-data";
  if (family.startsWith("Canonical ")) return "acquisition-analytics";
  if (["Care-seeker question", "Care inquiry", "Support email"].includes(family)) return "customer-voice";
  return family;
}

/**
 * Cause confidence, computed from evidence rather than self-reported.
 *
 * It was a field the model wrote about its own work, and the gate then demanded
 * it be better than `low`. `retainStrategicLensInvestigations` hardcoded `low`
 * on everything it kept, and `validateInvestigations` demoted anything `low`
 * out of `decision_ready`. So the value could not rise by any mechanism, the
 * gate could never open, and the repository executor — which has been wired up
 * and capable of opening pull requests since it was built — had fired exactly
 * zero times in the system's history as of 2026-09-21. Three proposals ever,
 * all on 2026-08-15, none approved.
 *
 * `docs/war-room-operating-agent.md` already diagnosed this and said probes
 * would close it, because "cause confidence only rises when a probe resolves a
 * hypothesis". Probes shipped. Nothing rose. That sentence described an
 * intention the code never implemented: probes emit evidence, and the model
 * remained free to keep writing `low` beside it.
 *
 * So derive it from what the system can count, using the same notions the
 * agenda gate already trusts — independent evidence families, and diagnosis
 * evidence that is not merely a capability index.
 *
 * `probe:` and `founder:` evidence are treated as resolving, because both are
 * answers to a question that was actually asked: a probe ran a real query, and
 * a founder answer is the person who knows telling us directly. A model
 * assertion never resolves anything; that is the whole point.
 */
export function computeCauseConfidence(
  evidenceIds: readonly string[],
  evidenceCatalog: WarRoomProposalEvidence[],
  openUnknowns = 0,
): "high" | "medium" | "low" {
  const evidenceById = new Map(evidenceCatalog.map((item) => [item.id, item]));
  const diagnosisIds = evidenceIds.filter((id) =>
    !id.startsWith("capability:")
    && !id.startsWith("decision:")
    && !id.startsWith("source:"),
  );
  const families = new Set(diagnosisIds
    .map((id) => evidenceById.get(id))
    .filter((item): item is WarRoomProposalEvidence => Boolean(item))
    .map(sourceFamily));
  const resolving = diagnosisIds.filter((id) => id.startsWith("probe:") || id.startsWith("founder:")).length;

  // Open unknowns dominate, and this is the part worth being stubborn about.
  // A first cut scored purely on evidence volume and promoted all nine live
  // investigations from `low` to `high` on 2026-09-21. That is not a gate
  // opening, it is a gate being lied to: every one of those nine carries four
  // competing hypotheses, an empty `resolution_evidence`, and a `likely_cause`
  // that begins with the word "Unresolved". Evidence volume measures how much
  // is known about the *condition*. It says nothing about the *cause*, and
  // confidence that ignores the difference manufactures decision-readiness out
  // of accumulated reading.
  //
  // So an unresolved unknown holds confidence down no matter how much evidence
  // has piled up beside it. The honest consequence is that today this returns
  // `low` for everything, exactly as before — the mechanical defect below was
  // real, but it was never the only reason the gate stays shut.
  if (openUnknowns > 0) return resolving >= 1 && openUnknowns <= 1 ? "medium" : "low";
  if (resolving >= 1 && families.size >= 2 && diagnosisIds.length >= 3) return "high";
  if (resolving >= 1 || (families.size >= 2 && diagnosisIds.length >= 3)) return "medium";
  return "low";
}

export function validateInvestigations(
  drafts: InvestigationDraft[],
  evidenceCatalog: WarRoomProposalEvidence[],
) {
  const validIds = new Set(evidenceCatalog.map((item) => item.id));
  const seen = new Set<string>();
  return drafts.filter((draft) => {
    if (!/^[a-z0-9][a-z0-9-]{4,99}$/.test(draft.fingerprint) || seen.has(draft.fingerprint)) return false;
    if (!WAR_ROOM_DOMAINS.includes(draft.domain)) return false;
    draft.evidenceIds = uniqueValid(draft.evidenceIds, validIds).slice(0, 12);
    draft.capabilityEvidenceIds = uniqueValid(draft.capabilityEvidenceIds, validIds)
      .filter((id) => id.startsWith("capability:"))
      .slice(0, 8);
    draft.options = draft.options.filter((option) =>
      WAR_ROOM_ACTION_KINDS.includes(option.actionKind)
      && cleanExecutiveText(option.title).length >= 8
      && cleanExecutiveText(option.logic).length >= 20
      && cleanExecutiveText(option.downside).length >= 8,
    ).slice(0, 5);
    draft.existingCapabilities = (draft.existingCapabilities ?? [])
      .map(cleanExecutiveText)
      .filter(Boolean)
      .slice(0, 8);
    draft.unknowns = (draft.unknowns ?? []).map(cleanExecutiveText).filter(Boolean).slice(0, 8);
    draft.hypotheses = (draft.hypotheses ?? []).map(cleanExecutiveText).filter(Boolean).slice(0, 6);
    draft.resolutionCriteria = (draft.resolutionCriteria ?? []).map(cleanExecutiveText).filter(Boolean).slice(0, 5);
    if (draft.nextProbe) {
      const nextProbe = {
        ...draft.nextProbe,
        question: cleanExecutiveText(draft.nextProbe.question),
        method: cleanExecutiveText(draft.nextProbe.method),
        expectedInformationGain: cleanExecutiveText(draft.nextProbe.expectedInformationGain),
      };
      draft.nextProbe = WAR_ROOM_PROBE_KINDS.includes(nextProbe.kind)
        && nextProbe.question.length >= 12
        && nextProbe.method.length >= 20
        && nextProbe.expectedInformationGain.length >= 20
        ? nextProbe
        : null;
    }
    const distinctOptions = new Set(draft.options.map((option) =>
      `${option.actionKind}:${cleanExecutiveText(option.title).toLowerCase()}`,
    ));
    if (draft.evidenceIds.length < 2) return false;
    // Recomputed from evidence, replacing whatever the model said about itself.
    draft.causeConfidence = computeCauseConfidence(draft.evidenceIds, evidenceCatalog, draft.unknowns.length);
    draft.founderAttentionMinutes = Math.max(0, Math.min(240, Math.round(draft.founderAttentionMinutes)));
    // Weak alternatives mean the case is not decision-ready. They do not make
    // the observed company condition disappear. Preserve it as private work so
    // the next scan can improve the diagnosis and intervention set.
    if (distinctOptions.size < 2 && draft.readiness === "decision_ready") {
      draft.readiness = "investigating";
      draft.readinessReason = "The condition is supported, but the intervention set is not yet strong enough for a founder decision.";
    }
    if (draft.causeConfidence === "low" && draft.readiness === "decision_ready") {
      draft.readiness = "investigating";
      draft.readinessReason = "The likely cause is still a hypothesis, so this remains a private investigation.";
    }
    if (draft.hypotheses.length < 2 && draft.readiness === "decision_ready") {
      draft.readiness = "investigating";
      draft.readinessReason = "Competing explanations have not been developed, so this remains a private investigation.";
    }
    if (draft.impact !== "high" && draft.readiness === "decision_ready") {
      draft.readiness = "watchlist";
      draft.readinessReason = "The issue may be real, but it is not material enough to interrupt the founder.";
    }
    seen.add(draft.fingerprint);
    return true;
  }).slice(0, 8);
}

const PROVEN_DROP_REASONS = new Set<InvestigationAssessment["reasonCode"]>([
  "resolved",
  "contradicted",
]);

/**
 * A private investigation needs a supported material condition, not a finished
 * causal theory or a ready intervention. Lens reviews are the investigator's
 * explicit company coverage; promote high/central unresolved reviews when the
 * richer dossier pass abstains or fails validation.
 */
// A condition raised by the lens sweep has no model-chosen probe, so map its
// domain onto the probe most likely to advance it. "none" is honest when no
// runnable probe applies; it is not a failure.
function lensProbeFor(domain: WarRoomDomain): (typeof WAR_ROOM_PROBE_KINDS)[number] {
  switch (domain) {
    case "provider": return "provider_contactability";
    case "customer":
    case "product": return "question_inventory_health";
    case "growth":
    case "content": return "traffic_by_page_family";
    case "revenue": return "revenue_by_product";
    case "operations": return "support_backlog_composition";
    default: return "none";
  }
}

export function retainStrategicLensInvestigations(
  existing: InvestigationDraft[],
  reviews: StrategicLensReview[],
  evidenceCatalog: WarRoomProposalEvidence[],
) {
  const validEvidenceIds = new Set(evidenceCatalog.map((item) => item.id));
  const seenFingerprints = new Set(existing.map((item) => item.fingerprint));
  const seenDomains = new Set<WarRoomDomain>(existing.map((item) => item.domain));
  const retained = [...existing];

  for (const review of reviews) {
    if (seenDomains.has(review.domain)) continue;
    seenDomains.add(review.domain);
    const shouldRetain = review.status === "decision_candidate"
      || review.status === "investigate" && (review.impact === "high" || review.strategicFit === "central")
      || review.status === "watch" && review.impact === "high" && review.strategicFit === "central";
    if (
      !shouldRetain
      || seenFingerprints.has(review.fingerprint)
      || !WAR_ROOM_DOMAINS.includes(review.domain)
      || !/^[a-z0-9][a-z0-9-]{4,99}$/.test(review.fingerprint)
    ) continue;
    const evidenceIds = uniqueValid(review.evidenceIds, validEvidenceIds).filter((id) =>
      !id.startsWith("capability:")
      && !id.startsWith("decision:"),
    );
    if (evidenceIds.length < 2) continue;

    retained.push({
      fingerprint: review.fingerprint,
      domain: review.domain,
      title: cleanExecutiveText(review.title),
      situation: cleanExecutiveText(review.finding),
      whyItMatters: cleanExecutiveText(review.whyItMatters),
      likelyCause: "The current evidence establishes the condition, but not yet its cause.",
      // Stays `low`, deliberately, and this is not the hardcode it looks like.
      // A retained lens condition is constructed two lines above with a
      // likelyCause that says in plain words that the cause is not established.
      // Scoring it from evidence promoted two of nine live investigations to
      // `medium` on 2026-09-21 -- the exact inflation computeCauseConfidence
      // exists to refuse. An investigation that admits it has no cause has low
      // cause confidence by definition, whatever has piled up beside it.
      causeConfidence: "low",
      existingCapabilities: [],
      capabilityEvidenceIds: [],
      unknowns: [cleanExecutiveText(review.unresolvedQuestion)].filter(Boolean),
      hypotheses: [],
      nextProbe: cleanExecutiveText(review.unresolvedQuestion) ? {
        kind: lensProbeFor(review.domain),
        question: cleanExecutiveText(review.unresolvedQuestion),
        method: "Use the next fresh read-only company evidence to separate the leading explanations before recommending an intervention.",
        expectedInformationGain: "Narrow the condition to a supported cause or identify the specific missing source required to continue.",
      } : null,
      resolutionCriteria: [
        "Current evidence contradicts the condition, or a measured intervention resolves it for the affected cohort.",
      ],
      options: [],
      evidenceIds,
      counterEvidence: "The current evidence may not capture every relevant channel or cohort; causal conclusions remain open.",
      readiness: review.status === "watch" ? "watchlist" : "investigating",
      readinessReason: "This is a material unresolved company condition. War Room is keeping it private until the cause and intervention are decision-ready.",
      impact: review.impact,
      urgency: review.urgency,
      strategicFit: review.strategicFit,
      founderAttentionMinutes: 0,
    });
    seenFingerprints.add(review.fingerprint);
  }

  return retained.slice(0, 8);
}

/**
 * The council may control founder attention, but it cannot erase unresolved
 * company reality. Missing evidence is a reason to investigate, not to drop.
 */
export function normalizeInvestigationAssessments(
  investigations: InvestigationDraft[],
  assessments: InvestigationAssessment[],
  acceptedAgendaFingerprints?: ReadonlySet<string>,
) {
  const supplied = new Map(assessments.map((assessment) => [assessment.fingerprint, assessment]));
  return investigations.map((investigation): InvestigationAssessment => {
    const fallbackDisposition = investigation.readiness === "watchlist" ? "watchlist" : "investigate";
    const fallback: InvestigationAssessment = {
      fingerprint: investigation.fingerprint,
      disposition: fallbackDisposition,
      reasonCode: fallbackDisposition === "watchlist" ? "monitor" : "needs_evidence",
      reason: cleanExecutiveText(investigation.readinessReason)
        || "The case remains unresolved and needs more evidence before it can reach the founder.",
    };
    const candidate = supplied.get(investigation.fingerprint) ?? fallback;
    const reason = cleanExecutiveText(candidate.reason) || fallback.reason;

    const isMaterialStructuralCase = investigation.impact === "high" && investigation.strategicFit === "central";
    if (
      candidate.disposition === "drop"
      && isMaterialStructuralCase
      && !PROVEN_DROP_REASONS.has(candidate.reasonCode)
    ) {
      return {
        fingerprint: investigation.fingerprint,
        disposition: investigation.readiness === "watchlist" ? "watchlist" : "investigate",
        reasonCode: investigation.readiness === "watchlist" ? "monitor" : "needs_evidence",
        reason: `The council did not prove this material condition was resolved or contradicted. ${reason}`.trim(),
      };
    }

    if (
      candidate.disposition === "agenda"
      && acceptedAgendaFingerprints
      && !acceptedAgendaFingerprints.has(investigation.fingerprint)
    ) {
      return {
        fingerprint: investigation.fingerprint,
        disposition: "investigate",
        reasonCode: "needs_evidence",
        reason: "The founder-interruption gate did not clear. Keep investigating the case instead of pretending it vanished.",
      };
    }

    return { ...candidate, reason };
  });
}

export function normalizeCompanyRead(
  draft: CompanyReadDraft | undefined,
  investigations: InvestigationDraft[],
  assessments: InvestigationAssessment[],
  evidenceCatalog: WarRoomProposalEvidence[],
  lensCoverage?: { complete: boolean; allClear: boolean; clearSummary?: string },
): WarRoomCompanyRead {
  const validEvidenceIds = new Set(evidenceCatalog.map((item) => item.id));
  const activeAssessments = assessments.filter((assessment) => assessment.disposition !== "drop");
  const activeFingerprints = new Set(activeAssessments.map((assessment) => assessment.fingerprint));
  const investigationByFingerprint = new Map(investigations.map((investigation) => [investigation.fingerprint, investigation]));
  const linked = [...new Set((draft?.investigationFingerprints ?? [])
    .filter((fingerprint) => activeFingerprints.has(fingerprint)))];
  for (const assessment of activeAssessments) {
    if (!linked.includes(assessment.fingerprint)) linked.push(assessment.fingerprint);
  }
  const linkedEvidenceIds = linked.flatMap((fingerprint) =>
    investigationByFingerprint.get(fingerprint)?.evidenceIds ?? [],
  );

  if (!investigations.length) {
    if (lensCoverage?.complete && lensCoverage.allClear) {
      return {
        summary: lensCoverage.clearSummary
          ?? "No founder decision is supported today. All ten company lenses were reviewed and the supplied evidence did not establish a material unresolved condition.",
        stance: "stable",
        investigationFingerprints: [],
        evidenceIds: [...new Set((draft?.evidenceIds ?? []).filter((id) => validEvidenceIds.has(id)))].slice(0, 10),
        unresolvedQuestions: (draft?.unresolvedQuestions ?? []).map(cleanExecutiveText).filter(Boolean).slice(0, 5),
      };
    }
    return {
      summary: "No founder decision is supported today, and this scan did not form a sufficiently evidenced private investigation. That is an evidence limitation, not proof that Olera has no important work.",
      stance: "stable",
      investigationFingerprints: [],
      evidenceIds: [],
      unresolvedQuestions: [],
    };
  }

  const hasAgenda = activeAssessments.some((assessment) => assessment.disposition === "agenda");
  const hasInvestigation = activeAssessments.some((assessment) => assessment.disposition === "investigate");
  const stance: WarRoomCompanyRead["stance"] = hasAgenda
    ? "decision_required"
    : hasInvestigation
      ? "investigating"
      : activeAssessments.length
        ? "monitoring"
        : "stable";
  const suppliedSummary = cleanExecutiveText(draft?.summary ?? "");
  const boundedSummary = suppliedSummary
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !(
      activeAssessments.length
      && /\b(?:nothing (?:here )?(?:has|is|was|moved|changed|worth)|hold founder attention|no (?:important )?(?:action|work|issue|risk))\b/i.test(sentence)
    ))
    .join(" ");
  const stanceLead = stance === "decision_required"
    ? "A founder decision is ready."
    : stance === "investigating"
      ? `No founder decision is ready today. War Room is actively investigating ${activeAssessments.length} unresolved case${activeAssessments.length === 1 ? "" : "s"}.`
      : stance === "monitoring"
        ? `No founder decision is needed today. War Room is monitoring ${activeAssessments.length} unresolved case${activeAssessments.length === 1 ? "" : "s"}.`
        : "No founder decision is supported today.";

  return {
    summary: `${stanceLead} ${boundedSummary || (!activeAssessments.length
      ? "The cases in this scan were resolved, contradicted, duplicated, or not material."
      : "The unresolved cases remain visible below.")}`.trim(),
    stance,
    investigationFingerprints: linked.slice(0, 8),
    evidenceIds: [...new Set([...(draft?.evidenceIds ?? []), ...linkedEvidenceIds]
      .filter((id) => validEvidenceIds.has(id)))].slice(0, 10),
    unresolvedQuestions: (draft?.unresolvedQuestions ?? []).map(cleanExecutiveText).filter(Boolean).slice(0, 5),
  };
}

function containsUnfinishedInvestigation(proposal: AgendaProposalDraft) {
  const text = [
    proposal.title,
    proposal.finding,
    proposal.proposedSolution,
    proposal.decisionRequired,
    proposal.whyBetterThanAlternatives,
    proposal.cheapestFalsification,
    ...proposal.executionPlan.flatMap((step) => [step.label, step.detail]),
  ].join(" ");
  return /\b(if none|if no|only if|whether .* exists|audit|inspect|locate|determine whether|find out whether|check whether)\b/i.test(text);
}

/**
 * Founder interruption is an all-gates decision. The numeric score is retained
 * for stable ordering and legacy storage, but it can never rescue a failed gate.
 */
/**
 * An instrument: repository work whose whole purpose is to resolve a named
 * unknown on a condition we already have corroborated evidence for.
 *
 * Deliberately strict about the things that keep it safe, and silent about the
 * thing it cannot have. It must be `code`, because only repository work has a
 * blast radius bounded by a pull request nobody has to merge. It must point at
 * an unknown the investigation actually recorded, so it cannot be a feature
 * wearing a lab coat. It must say how it will be read and how it could be shown
 * wrong cheaply.
 *
 * It is NOT required to know the cause. That is the entire point.
 */
function isInstrumentationProposal(
  proposal: AgendaProposalDraft,
  investigation: InvestigationDraft,
): boolean {
  // Repository work is bounded by a pull request nobody has to merge. A human
  // act is bounded by a named owner plus a founder approval, and the approval
  // is delivered to TJ rather than to the assignee, so nothing reaches a person
  // without him forwarding it. Both are acceptable; an unowned human act is
  // not, because nobody is accountable for it.
  //
  // Requiring `code` here contradicted the commission prompt, which tells the
  // model that an operations act with a named owner is often the right answer.
  // Two changes written the same day, disagreeing with each other.
  if (proposal.actionKind !== "code" && !proposal.assignedOwner?.trim()) return false;
  if (!investigation.unknowns.some((unknown) => cleanExecutiveText(unknown).length >= 12)) return false;
  // How it will be read, and how it could be cheaply falsified. An instrument
  // nobody will read is a feature, and one that cannot fail is decoration.
  if (cleanExecutiveText(proposal.successMeasure).length < 30) return false;
  if (cleanExecutiveText(proposal.cheapestFalsification).length < 20) return false;
  // Small or medium only. A large "instrument" is a rewrite in disguise, and
  // the case for it should rest on a diagnosis rather than on curiosity.
  return proposal.effort !== "large";
}

export function applyAgendaGate(
  proposals: AgendaProposalDraft[],
  investigations: InvestigationDraft[],
  evidenceCatalog: WarRoomProposalEvidence[],
) {
  const evidenceById = new Map(evidenceCatalog.map((item) => [item.id, item]));
  const validIds = new Set(evidenceById.keys());
  const investigationByFingerprint = new Map(investigations.map((item) => [item.fingerprint, item]));

  return proposals.flatMap((proposal) => {
    const investigation = investigationByFingerprint.get(proposal.sourceInvestigationFingerprint);
    proposal.evidenceIds = uniqueValid(proposal.evidenceIds, validIds).slice(0, 10);
    proposal.capabilityEvidenceIds = uniqueValid(proposal.capabilityEvidenceIds, validIds)
      .filter((id) => id.startsWith("capability:"))
      .slice(0, 8);
    proposal.founderAttentionMinutes = Math.max(0, Math.min(240, Math.round(proposal.founderAttentionMinutes)));
    proposal.evaluationWindowDays = Math.max(1, Math.min(180, Math.round(proposal.evaluationWindowDays)));
    const cleanedExistingCapabilities = proposal.existingCapabilities
      .map(cleanExecutiveText)
      .filter(Boolean)
      .slice(0, 8);
    const cleanedWhyBetter = cleanExecutiveText(proposal.whyBetterThanAlternatives);
    const cleanedSuccessMeasure = cleanExecutiveText(proposal.successMeasure);
    const cleanedExecutionPlan = proposal.executionPlan.map((step) => ({
      label: cleanExecutiveText(step.label),
      detail: cleanExecutiveText(step.detail),
    })).filter((step) => step.label.length >= 3 && step.detail.length >= 12).slice(0, 5);
    // Capability rows prove that Olera already has a system. They do not prove
    // that the diagnosed company problem exists, so they cannot supply an
    // "independent source" or satisfy the diagnosis-evidence minimum.
    const diagnosisEvidenceIds = proposal.evidenceIds.filter((id) =>
      !id.startsWith("capability:")
      && !id.startsWith("source:")
      && !id.startsWith("decision:"),
    );
    const evidenceFamilies = new Set(diagnosisEvidenceIds
      .map((id) => evidenceById.get(id))
      .filter((item): item is WarRoomProposalEvidence => Boolean(item))
      .map(sourceFamily));
    const investigationEvidenceIds = new Set(investigation?.evidenceIds ?? []);
    const sharedDiagnosisEvidence = diagnosisEvidenceIds.filter((id) => investigationEvidenceIds.has(id));
    const gate = {
      material: proposal.impact === "high"
        && proposal.strategicFit === "central"
        && investigation?.impact === "high"
        && investigation.strategicFit === "central"
        && proposal.domain === investigation.domain,
      // Two ways to clear this, because there are two kinds of work and only one
      // of them needs a settled cause.
      //
      // The original test demanded `decision_ready` and a cause better than
      // `low`. It has never once passed. Three proposals exist in the system's
      // entire history, all created 2026-08-15 before this gate existed, none
      // ever approved, and the repository executor -- a real coding agent that
      // opens pull requests -- has never fired. Meanwhile nine conditions were
      // re-observed up to 42 times each without producing anything.
      //
      // The reason is structural, not a threshold. An instrument is what you
      // build *because* the cause is unknown, so gating instrumentation on a
      // settled cause is backwards: the one class of work that resolves
      // uncertainty was the one class forbidden while uncertainty existed. All
      // three proposals that ever existed were instrumentation ("Make traffic
      // losses attributable", "Instrument the Ad Boost checkout funnel",
      // "Instrument the question-to-answer loop") and could only be produced
      // before the gate was built.
      //
      // So an instrument clears on different terms: it must name the unknown it
      // resolves, be repository work whose blast radius is a pull request a
      // human closes, state how it will be read, and be falsifiable cheaply. It
      // still needs real corroborated evidence that the *condition* is real --
      // that is not relaxed. What is relaxed is the demand to already know why.
      //
      // The company model authorises exactly this, added 2026-09-21: "the
      // repository executor cannot merge and cannot deploy, so the worst output
      // of an executed proposal is a pull request a human closes. Repository
      // proposals are therefore cheap, and should be generated freely rather
      // than rationed."
      causeSupported: investigation != null
        && diagnosisEvidenceIds.length >= 3
        && sharedDiagnosisEvidence.length >= 2
        && evidenceFamilies.size >= 2
        && (
          // Settled-cause route: act on a diagnosis we trust.
          (investigation.readiness === "decision_ready"
            && investigation.causeConfidence !== "low"
            && proposal.confidence !== "low")
          // Instrument route: resolve the uncertainty instead of asserting past it.
          || isInstrumentationProposal(proposal, investigation)
        ),
      existingStateVerified: cleanedExistingCapabilities.some((item) => item.length >= 20)
        && (proposal.actionKind !== "code" || proposal.capabilityEvidenceIds.length > 0),
      beatsAlternatives: investigation?.options.length ? investigation.options.length >= 2 && cleanedWhyBetter.length >= 40 : false,
      measurable: cleanedSuccessMeasure.length >= 30 && proposal.evaluationWindowDays > 0,
    };
    if (
      !Object.values(gate).every(Boolean)
      || containsUnfinishedInvestigation(proposal)
      || cleanedExecutionPlan.length < 2
      || proposal.founderAttentionMinutes > 30
      || !WAR_ROOM_ACTION_KINDS.includes(proposal.actionKind)
    ) return [];

    const priorityScore = Math.min(100,
      30
      + (proposal.confidence === "high" ? 25 : 15)
      + (proposal.urgency === "now" ? 20 : proposal.urgency === "soon" ? 10 : 0)
      + 20
      + (proposal.reversibility === "high" ? 5 : proposal.reversibility === "medium" ? 3 : 0)
      - (proposal.founderAttentionMinutes > 15 ? 5 : 0));
    return [{
      ...proposal,
      title: cleanExecutiveText(proposal.title),
      finding: cleanExecutiveText(proposal.finding),
      whyNow: cleanExecutiveText(proposal.whyNow),
      proposedSolution: cleanExecutiveText(proposal.proposedSolution),
      decisionRequired: cleanExecutiveText(proposal.decisionRequired),
      whyBetterThanAlternatives: cleanedWhyBetter,
      cheapestFalsification: cleanExecutiveText(proposal.cheapestFalsification),
      existingCapabilities: cleanedExistingCapabilities,
      executionPlan: cleanedExecutionPlan,
      counterEvidence: cleanExecutiveText(proposal.counterEvidence),
      successMeasure: cleanedSuccessMeasure,
      risk: cleanExecutiveText(proposal.risk),
      rollbackPlan: cleanExecutiveText(proposal.rollbackPlan),
      agendaGate: gate,
      priorityScore,
    }];
  }).sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 1);
}

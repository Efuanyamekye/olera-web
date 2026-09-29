import type { WarRoomCompanyRead, WarRoomProposalEvidence } from "@/lib/war-room/types";
import { leanAllClear, type LeanPriorityRead } from "@/lib/war-room/lean-scan";
import type { PriorityKey } from "@/lib/war-room/priorities";
import {
  applyAgendaGate,
  normalizeCompanyRead,
  normalizeInvestigationAssessments,
  requireCompleteStrategicLensCoverage,
  retainStrategicLensInvestigations,
  validateInvestigations,
  type AgendaProposalDraft,
  type CompanyReadDraft,
  type InvestigationAssessment,
  type InvestigationDraft,
  type StrategicLensReview,
} from "@/lib/war-room/strategy";

export type WarRoomInvestigatorOutput = {
  dossiers: InvestigationDraft[];
  lensReviews: StrategicLensReview[];
  portfolioRead: string;
  /**
   * Present only on a lean scan, which reads the four priorities instead of
   * the ten lenses. Its presence is what switches coverage below.
   */
  priorityReads?: Partial<Record<PriorityKey, LeanPriorityRead>>;
};

/**
 * What "the company was fully reviewed" means for this output. A full scan
 * must cover all ten lenses; a lean scan covers the four priorities and has no
 * lens reviews to require or to promote into investigations.
 */
function coverageFor(investigator: Pick<WarRoomInvestigatorOutput, "lensReviews" | "priorityReads">) {
  if (investigator.priorityReads) {
    return {
      lean: true,
      allClear: leanAllClear(investigator.priorityReads),
      clearSummary: "No founder decision is supported today. All four priorities were reviewed and the supplied evidence did not establish a material unresolved condition.",
    };
  }
  return {
    lean: false,
    allClear: (investigator.lensReviews ?? []).every((review) => review.status === "clear"),
    clearSummary: undefined,
  };
}

export type WarRoomCouncilOutput = {
  challenge: string;
  companyRead: CompanyReadDraft;
  rejectedReasons: string[];
  assessments: InvestigationAssessment[];
  proposals: AgendaProposalDraft[];
};

export type WarRoomReasoningResult = {
  detailedInvestigations: InvestigationDraft[];
  investigations: InvestigationDraft[];
  assessments: InvestigationAssessment[];
  proposals: ReturnType<typeof applyAgendaGate>;
  companyRead: WarRoomCompanyRead;
  validationTrace: {
    submittedDossiers: number;
    validDossiers: number;
    lensReviews: number;
    retainedInvestigations: number;
    requestedAgendaItems: number;
    blockedInterventions: number;
    acceptedAgendaItems: number;
  };
};

export function reconcilePersistedWarRoomAgenda(input: {
  investigations: InvestigationDraft[];
  assessments: InvestigationAssessment[];
  companyRead: CompanyReadDraft;
  evidenceCatalog: WarRoomProposalEvidence[];
  lensReviews: StrategicLensReview[];
  priorityReads?: WarRoomInvestigatorOutput["priorityReads"];
  acceptedInvestigationFingerprints: ReadonlySet<string>;
}) {
  const coverage = coverageFor(input);
  const assessments = normalizeInvestigationAssessments(
    input.investigations,
    input.assessments,
    input.acceptedInvestigationFingerprints,
  );
  const companyRead = normalizeCompanyRead(
    input.companyRead,
    input.investigations,
    assessments,
    input.evidenceCatalog,
    { complete: true, allClear: coverage.allClear, clearSummary: coverage.clearSummary },
  );
  return { assessments, companyRead };
}

/**
 * Run model output through the exact deterministic contract used in production.
 * Keeping this boundary pure makes failed scans replayable without another API
 * call or any write to Olera's live data.
 */
export function evaluateWarRoomReasoning(input: {
  evidenceCatalog: WarRoomProposalEvidence[];
  investigator: WarRoomInvestigatorOutput;
  council: WarRoomCouncilOutput;
  blockedInterventionFingerprints?: ReadonlySet<string>;
}): WarRoomReasoningResult {
  const { evidenceCatalog, investigator, council } = input;
  const coverage = coverageFor(investigator);
  const lensReviews = coverage.lean
    ? []
    : requireCompleteStrategicLensCoverage(investigator.lensReviews ?? [], evidenceCatalog);
  const detailedInvestigations = validateInvestigations(investigator.dossiers ?? [], evidenceCatalog);
  const investigations = coverage.lean
    ? detailedInvestigations
    : retainStrategicLensInvestigations(detailedInvestigations, lensReviews, evidenceCatalog);
  const eligibleProposals = (council.proposals ?? []).filter((proposal) =>
    !input.blockedInterventionFingerprints?.has(proposal.fingerprint));
  const initialAssessments = normalizeInvestigationAssessments(
    investigations,
    council.assessments ?? [],
  );
  const requestedAgendaFingerprints = new Set(initialAssessments
    .filter((assessment) => assessment.disposition === "agenda")
    .map((assessment) => assessment.fingerprint));
  // A commission comes from a condition triage marked `needs_evidence`, which
  // by definition is NOT `agenda`. Filtering on agenda alone therefore drafted
  // the commission, paid for the model call, and dropped it one step before the
  // gate -- the same "built downstream of a filter nobody checked" defect that
  // hid the metrics work and the instrument route earlier the same day.
  const commissionedFingerprints = new Set(initialAssessments
    .filter((assessment) => assessment.reasonCode === "needs_evidence")
    .map((assessment) => assessment.fingerprint));
  const proposals = applyAgendaGate(
    eligibleProposals.filter((proposal) =>
      requestedAgendaFingerprints.has(proposal.sourceInvestigationFingerprint)
      || commissionedFingerprints.has(proposal.sourceInvestigationFingerprint)),
    investigations,
    evidenceCatalog,
  ).map((proposal) => ({
    ...proposal,
    adminHref: proposal.adminHref?.startsWith("/admin/") ? proposal.adminHref : null,
  }));
  const acceptedAgendaFingerprints = new Set(
    proposals.map((proposal) => proposal.sourceInvestigationFingerprint),
  );
  const assessments = normalizeInvestigationAssessments(
    investigations,
    initialAssessments,
    acceptedAgendaFingerprints,
  );
  const companyRead = normalizeCompanyRead(
    council.companyRead,
    investigations,
    assessments,
    evidenceCatalog,
    { complete: true, allClear: coverage.allClear, clearSummary: coverage.clearSummary },
  );

  return {
    detailedInvestigations,
    investigations,
    assessments,
    proposals,
    companyRead,
    validationTrace: {
      submittedDossiers: investigator.dossiers?.length ?? 0,
      validDossiers: detailedInvestigations.length,
      lensReviews: lensReviews.length,
      retainedInvestigations: investigations.length,
      requestedAgendaItems: council.proposals?.length ?? 0,
      blockedInterventions: (council.proposals?.length ?? 0) - eligibleProposals.length,
      acceptedAgendaItems: proposals.length,
    },
  };
}

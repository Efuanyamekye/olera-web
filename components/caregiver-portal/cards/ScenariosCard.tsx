import type { StudentMetadata } from "@/lib/types";
import CaregiverSectionCard, { EmptyState } from "./CaregiverSectionCard";
import { SCENARIO_QUESTIONS } from "@/lib/medjobs-completeness";

// Meaningful labels for each screening question
const QUESTION_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  scenario_reliability: {
    label: "Reliability",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  scenario_judgement: {
    label: "Judgement",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
      </svg>
    ),
  },
  scenario_commitment: {
    label: "Commitment",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
      </svg>
    ),
  },
};

interface ScenariosCardProps {
  meta: StudentMetadata;
  onEdit?: () => void;
}

export default function ScenariosCard({ meta, onEdit }: ScenariosCardProps) {
  const responses = meta.scenario_responses || [];
  const answeredCount = responses.filter((r) => (r.answer?.length ?? 0) >= 50).length;
  const totalQuestions = SCENARIO_QUESTIONS.length;
  const isComplete = answeredCount >= totalQuestions;

  return (
    <CaregiverSectionCard
      title="Screening"
      isComplete={isComplete}
      id="scenarios"
      onEdit={onEdit}
    >
      {responses.length === 0 ? (
        <EmptyState
          message="No answers yet"
          subMessage="Answer screening questions to show providers your judgement."
          icon={
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
            </svg>
          }
        />
      ) : (
        <div className="space-y-4">
          {/* Verification badges */}
          <div className="flex flex-wrap gap-2">
            {SCENARIO_QUESTIONS.map((q) => {
              const response = responses.find((r) => r.question === q.question);
              const isDone = (response?.answer?.length ?? 0) >= 50;
              const questionMeta = QUESTION_LABELS[q.key] || { label: q.key, icon: null };

              return (
                <div
                  key={q.key}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    isDone
                      ? "bg-gray-100 text-gray-700"
                      : "bg-gray-50 text-gray-400"
                  }`}
                >
                  {isDone ? (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border border-current" />
                  )}
                  {questionMeta.label}
                </div>
              );
            })}
          </div>

          {/* Summary text */}
          {isComplete ? (
            <p className="text-xs text-gray-500">
              All screening checks passed
            </p>
          ) : (
            <p className="text-xs text-gray-500">
              {answeredCount} of {totalQuestions} completed
            </p>
          )}
        </div>
      )}
    </CaregiverSectionCard>
  );
}

import type { ReactNode } from "react";

interface CaregiverSectionCardProps {
  title: string;
  /** Completion percentage (0-100). If provided, shows percentage badge. */
  completionPercent?: number;
  /** Legacy: boolean for complete/incomplete. Converted to 100/0 percent. */
  isComplete?: boolean;
  children: ReactNode;
  id?: string;
  onEdit?: () => void;
}

export default function CaregiverSectionCard({
  title,
  completionPercent,
  isComplete,
  children,
  id,
  onEdit,
}: CaregiverSectionCardProps) {
  // Support both completionPercent and legacy isComplete
  const percent = completionPercent ?? (isComplete === true ? 100 : isComplete === false ? 0 : undefined);

  return (
    <section
      id={id}
      className="bg-white rounded-2xl border border-gray-200/80 p-6"
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-[24px] font-display font-bold text-gray-900 truncate min-w-0">{title}</h3>
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Edit button */}
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-900 hover:text-primary-600 hover:border-primary-300 hover:bg-primary-50 transition-all duration-200"
              aria-label={`Edit ${title}`}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                />
              </svg>
            </button>
          )}
          {/* Completion status badge - "Done" for complete, % for incomplete */}
          {percent !== undefined && (
            percent >= 100 ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-success-50 text-success-700">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
                Done
              </span>
            ) : (
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary-50 text-primary-700">
                {percent}%
              </span>
            )
          )}
        </div>
      </div>

      {/* Content */}
      {children}
    </section>
  );
}

interface EmptyStateProps {
  message: string;
  subMessage?: string;
  icon?: ReactNode;
}

export function EmptyState({ message, subMessage, icon }: EmptyStateProps) {
  return (
    <div className="text-center py-6">
      <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-100 flex items-center justify-center">
        {icon || (
          <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        )}
      </div>
      <p className="text-sm font-medium text-gray-500">{message}</p>
      {subMessage && <p className="text-xs text-gray-400 mt-1 max-w-[240px] mx-auto">{subMessage}</p>}
    </div>
  );
}

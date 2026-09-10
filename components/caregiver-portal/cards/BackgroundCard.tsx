import type { StudentMetadata } from "@/lib/types";
import CaregiverSectionCard, { EmptyState } from "./CaregiverSectionCard";

interface BackgroundCardProps {
  meta: StudentMetadata;
  onEdit?: () => void;
}

// Neutral tag styles - differentiation through label text, not color
const TAG_STYLES: Record<string, { label: string; className: string }> = {
  paid: { label: "Paid", className: "bg-gray-100 text-gray-700 border-gray-200" },
  volunteer: { label: "Volunteer", className: "bg-gray-100 text-gray-700 border-gray-200" },
  family: { label: "Family", className: "bg-gray-100 text-gray-700 border-gray-200" },
  clinical: { label: "Clinical", className: "bg-gray-100 text-gray-700 border-gray-200" },
  internship: { label: "Internship", className: "bg-gray-100 text-gray-700 border-gray-200" },
  other: { label: "Other", className: "bg-gray-100 text-gray-600 border-gray-200" },
};

function formatMonth(ym: string): string {
  const [year, month] = ym.split("-");
  if (!month) return year;
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default function BackgroundCard({ meta, onEdit }: BackgroundCardProps) {
  const hasEntries = (meta.experience_entries?.length ?? 0) > 0;

  // Sort entries newest first
  const sortedEntries = hasEntries
    ? [...meta.experience_entries!].sort((a, b) => (b.start_date > a.start_date ? 1 : -1))
    : [];

  return (
    <CaregiverSectionCard
      title="Experience"
      isComplete={hasEntries}
      id="background"
      onEdit={onEdit}
    >
      {!hasEntries ? (
        <EmptyState
          message="No experience added"
          subMessage="Add your caregiving roles — paid, volunteer, family, or clinical."
          icon={
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" />
            </svg>
          }
        />
      ) : (
        <div className="relative pl-4 border-l-2 border-gray-200 space-y-3">
          {sortedEntries.slice(0, 3).map((entry) => {
            const tagStyle = TAG_STYLES[entry.tag] || TAG_STYLES.other;
            return (
              <div key={entry.id} className="relative">
                <div className="absolute -left-[calc(1rem+5px)] top-1.5 w-2 h-2 rounded-full bg-gray-400" />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{entry.title}</p>
                    <p className="text-xs text-gray-500">
                      {formatMonth(entry.start_date)} – {entry.end_date ? formatMonth(entry.end_date) : "Present"}
                    </p>
                  </div>
                  <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${tagStyle.className}`}>
                    {tagStyle.label}
                  </span>
                </div>
                {entry.description && (
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{entry.description}</p>
                )}
              </div>
            );
          })}
          {sortedEntries.length > 3 && (
            <p className="text-xs text-gray-400 pl-1">+{sortedEntries.length - 3} more</p>
          )}
        </div>
      )}
    </CaregiverSectionCard>
  );
}

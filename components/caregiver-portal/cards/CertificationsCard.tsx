import type { StudentMetadata } from "@/lib/types";
import CaregiverSectionCard, { EmptyState } from "./CaregiverSectionCard";

interface CertificationsCardProps {
  meta: StudentMetadata;
  onEdit?: () => void;
}

export default function CertificationsCard({ meta, onEdit }: CertificationsCardProps) {
  const hasCerts = (meta.certifications?.length ?? 0) > 0;

  return (
    <CaregiverSectionCard
      title="Certifications"
      isComplete={hasCerts}
      id="certifications"
      onEdit={onEdit}
    >
      {!hasCerts ? (
        <EmptyState
          message="No certifications added"
          subMessage="Add any certifications you have — CNA, BLS, CPR, etc. No certs? No problem."
          icon={
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          }
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          {meta.certifications!.map((cert) => (
            <span
              key={cert}
              className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-700 border border-gray-200"
            >
              {cert}
            </span>
          ))}
        </div>
      )}
    </CaregiverSectionCard>
  );
}

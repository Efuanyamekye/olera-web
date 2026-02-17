"use client";

interface CardBottomSectionProps {
  acceptedPayments: string[];
}

export default function CardBottomSection({
  acceptedPayments,
}: CardBottomSectionProps) {
  if (acceptedPayments.length === 0) return null;

  return (
    <>
      <div className="h-px bg-gray-200" />
      <div className="px-5 pt-3.5 pb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400 mb-2">
          Accepted payments
        </p>
        <div className="flex flex-wrap gap-1.5">
          {acceptedPayments.map((payment) => (
            <span
              key={payment}
              className="text-xs text-gray-600 bg-gray-100 px-2.5 py-1 rounded"
            >
              {payment}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}

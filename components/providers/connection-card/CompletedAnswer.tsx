"use client";

interface CompletedAnswerProps {
  label: string;
  value: string;
  onEdit: () => void;
}

export default function CompletedAnswer({
  label,
  value,
  onEdit,
}: CompletedAnswerProps) {
  return (
    <div className="flex justify-between items-center px-3 py-2 bg-gray-50 rounded-lg mb-1.5 border border-gray-100">
      <div>
        <span className="text-xs text-gray-400">{label}</span>
        <p className="text-sm text-gray-800 font-medium mt-0.5">{value}</p>
      </div>
      <button
        onClick={onEdit}
        className="text-xs text-primary-600 underline decoration-primary-600/25 underline-offset-2 hover:decoration-primary-600/50 transition-colors"
      >
        Edit
      </button>
    </div>
  );
}

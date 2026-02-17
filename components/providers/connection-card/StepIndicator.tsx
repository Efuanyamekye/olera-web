"use client";

interface StepIndicatorProps {
  current: number;
  total: number;
}

export default function StepIndicator({ current, total }: StepIndicatorProps) {
  return (
    <div className="flex gap-1 justify-center mb-3.5">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i === current
              ? "w-5 bg-primary-600"
              : i < current
              ? "w-1.5 bg-primary-500"
              : "w-1.5 bg-gray-200"
          }`}
        />
      ))}
    </div>
  );
}

"use client";

interface PillProps {
  label: string;
  selected: boolean;
  onClick: () => void;
  small?: boolean;
}

export default function Pill({ label, selected, onClick, small }: PillProps) {
  return (
    <button
      onClick={onClick}
      className={`
        ${small ? "px-3 py-1.5 text-xs rounded-full" : "px-3.5 py-2.5 text-[13px] rounded-lg"}
        border-[1.5px] font-normal text-left cursor-pointer transition-all duration-150
        ${
          selected
            ? "border-primary-600 bg-primary-50 text-primary-700 font-semibold"
            : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
        }
      `}
    >
      {selected && small && "\u2713 "}
      {label}
    </button>
  );
}

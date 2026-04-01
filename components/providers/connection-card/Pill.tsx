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
        ${small ? "px-3.5 py-2 min-h-[44px] text-sm rounded-full" : "px-4 py-3 min-h-[44px] text-[15px] rounded-xl"}
        whitespace-nowrap border-[1.5px] font-normal text-center cursor-pointer transition-all duration-150
        ${
          selected
            ? "border-primary-600 bg-primary-100 text-primary-700 font-semibold shadow-sm"
            : "border-primary-100 bg-primary-25 text-gray-700 hover:border-primary-300 hover:bg-primary-50 hover:shadow-sm"
        }
      `}
    >
      {selected && <span className="mr-1 text-sm">&#10003;</span>}
      {label}
    </button>
  );
}

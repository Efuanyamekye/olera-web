"use client";

import PhoneButton from "./PhoneButton";

interface DefaultActionsProps {
  providerName: string;
  phone: string | null;
  phoneRevealed: boolean;
  saved: boolean;
  onConnect: () => void;
  onRevealPhone: () => void;
  onToggleSave: () => void;
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={filled ? "#EF4444" : "none"}
      stroke={filled ? "#EF4444" : "currentColor"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={filled ? "" : "text-gray-400"}
    >
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
    </svg>
  );
}

export default function DefaultActions({
  providerName,
  phone,
  phoneRevealed,
  saved,
  onConnect,
  onRevealPhone,
  onToggleSave,
}: DefaultActionsProps) {
  return (
    <>
      {/* Primary CTA */}
      <button
        onClick={onConnect}
        className="w-full py-3.5 bg-primary-600 hover:bg-primary-500 text-white border-none rounded-[10px] text-[15px] font-semibold cursor-pointer tracking-tight transition-colors"
      >
        Connect with {providerName}
      </button>

      {/* Masked phone */}
      <div className="mt-2.5">
        <PhoneButton
          phone={phone}
          revealed={phoneRevealed}
          onReveal={onRevealPhone}
        />
      </div>

      {/* Save action */}
      <button
        onClick={onToggleSave}
        className="flex items-center justify-center gap-1.5 w-full mt-3.5 py-1 cursor-pointer bg-transparent border-none"
      >
        <HeartIcon filled={saved} />
        <span
          className={`text-[13px] font-medium ${
            saved ? "text-red-500" : "text-gray-500"
          }`}
        >
          {saved ? "Saved" : "Save this provider"}
        </span>
      </button>
    </>
  );
}

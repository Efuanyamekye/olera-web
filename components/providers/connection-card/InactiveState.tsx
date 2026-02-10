"use client";

interface InactiveStateProps {
  providerName: string;
  saved: boolean;
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
      className={filled ? "" : "text-gray-500"}
    >
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
    </svg>
  );
}

export default function InactiveState({
  providerName,
  saved,
  onToggleSave,
}: InactiveStateProps) {
  return (
    <>
      {/* Unavailable message */}
      <div className="px-4 py-4 bg-amber-50 rounded-[10px] mb-4 border border-amber-100">
        <p className="text-[13px] text-gray-700 leading-relaxed">
          <strong>{providerName}</strong> isn&apos;t accepting new requests
          right now.
        </p>
      </div>

      {/* Save for later */}
      <button
        onClick={onToggleSave}
        className="flex items-center justify-center gap-1.5 w-full py-2.5 border border-gray-200 rounded-[10px] cursor-pointer bg-transparent hover:bg-gray-50 transition-colors mb-2.5"
      >
        <HeartIcon filled={saved} />
        <span className="text-[13px] text-gray-600 font-medium">
          {saved ? "Saved for later" : "Save for later"}
        </span>
      </button>

      {/* Browse similar */}
      <a
        href="/browse"
        className="block w-full text-center text-[13px] text-primary-600 font-medium mt-2.5 underline decoration-primary-600/25 underline-offset-2 hover:decoration-primary-600/50 transition-colors"
      >
        Browse similar providers nearby &rarr;
      </a>
    </>
  );
}

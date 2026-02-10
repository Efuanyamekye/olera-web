"use client";

interface PhoneButtonProps {
  phone: string | null;
  revealed: boolean;
  onReveal: () => void;
}

/**
 * Mask a phone number, keeping area code and first digit visible.
 * "(512) 555-0100" → "(512) 555-••••"
 */
function maskPhone(phone: string): string {
  // Try to find the last 4 digits and replace them
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length >= 10) {
    const areaCode = cleaned.slice(0, 3);
    const exchange = cleaned.slice(3, 6);
    return `(${areaCode}) ${exchange}-\u2022\u2022\u2022\u2022`;
  }
  // Fallback: mask last 4 characters
  if (phone.length > 4) {
    return phone.slice(0, -4) + "\u2022\u2022\u2022\u2022";
  }
  return phone;
}

export default function PhoneButton({
  phone,
  revealed,
  onReveal,
}: PhoneButtonProps) {
  if (!phone) return null;

  if (revealed) {
    return (
      <a
        href={`tel:${phone}`}
        className="w-full border border-gray-200 text-gray-700 hover:bg-gray-50 font-medium py-3 rounded-[10px] transition-colors flex items-center justify-center gap-2 text-sm"
      >
        <PhoneIcon />
        {phone}
      </a>
    );
  }

  return (
    <button
      onClick={onReveal}
      className="w-full border border-gray-200 text-gray-700 hover:bg-gray-50 font-medium py-3 rounded-[10px] transition-colors flex items-center justify-center gap-2 text-sm"
    >
      <PhoneIcon />
      {maskPhone(phone)}
      <span className="text-[11px] text-gray-400">Show</span>
    </button>
  );
}

function PhoneIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-primary-600"
    >
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
    </svg>
  );
}

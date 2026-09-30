/**
 * Program glyphs for the finder results: a filled object on a soft tinted
 * square, one per kind of help. Chosen 2026-09-30 over line, dimensional
 * and no-icon versions (mock: claude.ai/artifact/Tv1tgb3Vr1bfcnMxofh9y4):
 * filled shapes read better than thin strokes for older eyes at row size,
 * and it is one visual language to extend to new kinds of help.
 *
 * Always decorative: the program name next to it carries the meaning.
 */

import type { FinderIconName } from "@/lib/benefits/finder-answers";

const ICONS: Record<FinderIconName, { bg: string; svg: React.ReactNode }> = {
  "phone": { bg: "#d8edec", svg: <><path d="M14.5 10.5c1.3-.9 2.6-.8 3.5.5l1.7 3c.7 1.2.3 2.2-.7 2.9l-1.2.9c.9 2.3 2.6 4.1 4.8 5.1l1-1.1c.8-.9 1.8-1.1 2.9-.4l2.9 1.9c1.2.8 1.1 2.2.2 3.4-1.5 2-3.8 2.6-6 1.7-5.2-2-9.1-6-10.8-11.2-.7-2.2 0-4.4 1.7-5.7Z" fill="#2f5d5d"/><path d="M24 11c2.6.5 4.6 2.5 5.1 5.1" stroke="#2f5d5d" strokeWidth="1.8" strokeLinecap="round" opacity=".45"/></> },
  "caregiver": { bg: "#f6dcc4", svg: <><path d="M20 29s-9-5.4-9-11.7a4.9 4.9 0 0 1 9-2.7 4.9 4.9 0 0 1 9 2.7C29 23.6 20 29 20 29Z" fill="#c9774a"/><path d="M16 17.5a3 3 0 0 1 3-2" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" opacity=".7"/></> },
  "medicare": { bg: "#d8edec", svg: <><rect x="9" y="12.5" width="22" height="15" rx="2.5" fill="#2f5d5d"/><rect x="9" y="16" width="22" height="3" fill="#1e3f3f"/><rect x="12" y="21.5" width="8" height="2" rx="1" fill="#ffffff" opacity=".85"/><circle cx="26.5" cy="23" r="2" fill="#e9bd91"/></> },
  "energy": { bg: "#f9e8c9", svg: <><path d="M20 9a7.2 7.2 0 0 0-4.5 12.8c.9.7 1.3 1.8 1.3 2.9V26h6.4v-1.3c0-1.1.5-2.2 1.3-2.9A7.2 7.2 0 0 0 20 9Z" fill="#d99a2b"/><rect x="17" y="27.5" width="6" height="2.4" rx="1.2" fill="#2f5d5d"/><path d="M17.5 13.5a4 4 0 0 1 3-1.5" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" opacity=".75"/></> },
  "home": { bg: "#f6dcc4", svg: <><path d="M9 20.5 20 11l11 9.5V30a1.5 1.5 0 0 1-1.5 1.5h-19A1.5 1.5 0 0 1 9 30v-9.5Z" fill="#c9774a"/><path d="M20 27s-3.6-2.1-3.6-4.6a2 2 0 0 1 3.6-1.1 2 2 0 0 1 3.6 1.1C23.6 24.9 20 27 20 27Z" fill="#ffffff"/></> },
  "groceries": { bg: "#dcefd9", svg: <><path d="M11 16h18l-1.4 14a2 2 0 0 1-2 1.8H14.4a2 2 0 0 1-2-1.8L11 16Z" fill="#3f7d4c"/><path d="M15.5 16v-1.6a4.5 4.5 0 0 1 9 0V16" stroke="#3f7d4c" strokeWidth="2" strokeLinecap="round"/><circle cx="17" cy="22" r="1.4" fill="#ffffff" opacity=".6"/></> },
  "meals": { bg: "#f6dcc4", svg: <><path d="M10 25a10 10 0 0 1 20 0Z" fill="#c9774a"/><rect x="8" y="25" width="24" height="2.6" rx="1.3" fill="#2f5d5d"/><circle cx="20" cy="13.2" r="1.7" fill="#c9774a"/><path d="M14 22a6 6 0 0 1 4-4" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" opacity=".6"/></> },
  "weather": { bg: "#d8edec", svg: <><rect x="11" y="10.5" width="18" height="19" rx="2" fill="#2f5d5d"/><rect x="13" y="12.5" width="6" height="7" rx="1" fill="#bfe2ef"/><rect x="21" y="12.5" width="6" height="7" rx="1" fill="#bfe2ef"/><rect x="13" y="21.5" width="6" height="6" rx="1" fill="#bfe2ef"/><rect x="21" y="21.5" width="6" height="6" rx="1" fill="#bfe2ef"/></> },
  "clinic": { bg: "#d8edec", svg: <><rect x="10" y="12" width="20" height="18" rx="2.5" fill="#2f5d5d"/><path d="M20 16v8M16 20h8" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round"/></> },
  "helper": { bg: "#f6dcc4", svg: <><path d="M20 31s-8-7.6-8-13.4a8 8 0 0 1 16 0C28 23.4 20 31 20 31Z" fill="#c9774a"/><circle cx="20" cy="17" r="3" fill="#ffffff"/></> },
  "docs": { bg: "#e9eef0", svg: <><rect x="12" y="10.5" width="16" height="21" rx="2.2" fill="#2f5d5d"/><rect x="16" y="9" width="8" height="3.4" rx="1" fill="#1e3f3f"/><path d="M15.5 18l1.8 1.8 3-3M15.5 25l1.8 1.8 3-3" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></> },
  "money": { bg: "#dcefd9", svg: <><circle cx="20" cy="20" r="10.5" fill="#3f7d4c"/><path d="M20 14.5v11M17.2 17.6c0-1.3 1.2-2 2.8-2s2.8.7 2.8 2-1.3 2-2.8 2-2.8.7-2.8 2 1.2 2 2.8 2 2.8-.7 2.8-2" stroke="#fff" strokeWidth="1.7" strokeLinecap="round"/></> },
};

export default function FinderIcon({ name, size = 40 }: { name: FinderIconName; size?: number }) {
  const icon = ICONS[name] ?? ICONS.clinic;
  return (
    <span
      aria-hidden
      className="inline-grid place-items-center shrink-0 rounded-xl"
      style={{ width: size, height: size, background: icon.bg }}
    >
      <svg width={size * 0.82} height={size * 0.82} viewBox="0 0 40 40" fill="none">
        {icon.svg}
      </svg>
    </span>
  );
}

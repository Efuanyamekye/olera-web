/**
 * The inbox's empty states, in the shape Airbnb uses for its own: a drawn
 * picture, one bold line, one plain sentence about what happens next, and at
 * most one quiet button.
 *
 * The picture is two message cards in Olera's teal and cream. "waiting" has
 * someone typing on the front card; "private" has a lock, for a conversation
 * this account can't open. The motion is small and stops for anyone who has
 * asked for less of it.
 */

import Link from "next/link";
import type { ReactNode } from "react";

function Picture({ kind }: { kind: "waiting" | "private" }) {
  return (
    <svg width="168" height="128" viewBox="0 0 168 128" fill="none" aria-hidden="true" className="oie-pic">
      <style>{`
        .oie-pic .oie-front { animation: oie-float 5s ease-in-out infinite; transform-origin: 96px 70px; }
        .oie-pic .oie-dot { animation: oie-dot 1.4s ease-in-out infinite; }
        .oie-pic .oie-dot:nth-of-type(2) { animation-delay: .18s; }
        .oie-pic .oie-dot:nth-of-type(3) { animation-delay: .36s; }
        @keyframes oie-float { 0%, 100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-4px) rotate(-1deg); } }
        @keyframes oie-dot { 0%, 60%, 100% { opacity: .35; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-2px); } }
        @media (prefers-reduced-motion: reduce) { .oie-pic .oie-front, .oie-pic .oie-dot { animation: none; } }
      `}</style>
      {/* Ground */}
      <ellipse cx="84" cy="112" rx="58" ry="7" fill="#edf7f7" />
      {/* Back card, tilted, cream */}
      <g transform="rotate(-9 58 56)">
        <rect x="18" y="26" width="80" height="58" rx="14" fill="#F1E5D6" />
        <rect x="30" y="42" width="44" height="7" rx="3.5" fill="#fff" opacity=".85" />
        <rect x="30" y="56" width="30" height="7" rx="3.5" fill="#fff" opacity=".85" />
      </g>
      {/* Front card, white, floating */}
      <g className="oie-front">
        <rect x="56" y="40" width="92" height="62" rx="16" fill="#fff" stroke="#bee0e0" strokeWidth="2" />
        <path d="M74 102 l-6 12 l16 -12 z" fill="#fff" />
        <path d="M74 101 l-6 13 l17 -12" stroke="#bee0e0" strokeWidth="2" strokeLinejoin="round" fill="none" />
        {kind === "waiting" ? (
          <g>
            <circle className="oie-dot" cx="88" cy="71" r="5" fill="#5fa3a3" />
            <circle className="oie-dot" cx="102" cy="71" r="5" fill="#5fa3a3" />
            <circle className="oie-dot" cx="116" cy="71" r="5" fill="#5fa3a3" />
          </g>
        ) : (
          <g transform="translate(90 55)">
            <rect x="0" y="12" width="24" height="20" rx="5" fill="#4d8a8a" />
            <path d="M5 12 V8 a7 7 0 0 1 14 0 v4" stroke="#4d8a8a" strokeWidth="3.5" fill="none" strokeLinecap="round" />
            <circle cx="12" cy="21" r="2.6" fill="#fff" />
          </g>
        )}
      </g>
      {/* A leaf, Olera's mark, tucked on the corner */}
      <path d="M146 36 c-12 -2 -20 6 -18 18 c12 2 20 -6 18 -18 z" fill="#96c8c8" />
      <path d="M130 52 c4 -5 9 -9 14 -13" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export default function InboxEmptyState({
  kind = "waiting",
  title,
  body,
  action,
  className = "",
}: {
  kind?: "waiting" | "private";
  title: string;
  body: ReactNode;
  /** One quiet button: a link, or a handler. */
  action?: { label: string; href?: string; onClick?: () => void };
  className?: string;
}) {
  const button =
    "inline-flex h-11 items-center justify-center rounded-xl border border-gray-300 bg-white px-5 text-[15px] font-semibold text-gray-900 transition-colors hover:border-gray-900";
  return (
    <div className={`flex flex-col items-center px-8 text-center ${className}`}>
      <Picture kind={kind} />
      <h3 className="mt-5 text-[22px] font-display font-bold leading-tight text-gray-900 [text-wrap:balance]">{title}</h3>
      <p className="mt-2 max-w-[300px] text-[15px] leading-relaxed text-gray-500 [text-wrap:pretty]">{body}</p>
      {action &&
        (action.href ? (
          <Link href={action.href} className={`${button} mt-6`}>
            {action.label}
          </Link>
        ) : (
          <button type="button" onClick={action.onClick} className={`${button} mt-6`}>
            {action.label}
          </button>
        ))}
    </div>
  );
}

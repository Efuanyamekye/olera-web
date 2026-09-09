"use client";

import { useCallback, useRef, useState } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";

/**
 * The reader shared by the four SOP pages: System, Admin, Sales and CRM.
 *
 * Jumps address a PDF **named destination**, not a page. Chromium writes one
 * for every heading the document links to, carrying the heading's own y
 * coordinate, so the section title lands at the top of the viewer instead of
 * wherever its page happens to start. It also means a rebuild that repaginates
 * the document cannot break the jump bar.
 *
 * The walkthrough sits beside the document's own title on every tab, because
 * the video walks through this operating system: from wherever you are
 * reading, the recording of it is one click away.
 */

const VIDEO = "/api/admin/medjobs/sop?doc=video";

/** The external-link mark beside the walkthrough. */
function LinkIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      aria-hidden
    >
      <path d="M6.5 3H3.5A0.5.5 0 0 0 3 3.5v9a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5v-3" strokeLinecap="round" />
      <path d="M9.5 2.5H13.5V6.5M13 3l-5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export interface SopJump {
  /** Short label on the button. */
  label: string;
  /** Full section name, shown on hover. */
  title: string;
  /** PDF named destination. Preferred: it lands on the heading itself. */
  dest?: string;
  /** Page number, for the two targets that are a page top with no heading id. */
  page?: number;
  /** Start a new group; renders a rule before this button. */
  divide?: boolean;
}

/** What goes after the `#` for one jump. */
export function sopHash(jump: Pick<SopJump, "dest" | "page">) {
  return jump.dest ? `nameddest=${jump.dest}` : `page=${jump.page}&view=FitH`;
}

export default function SopReader({
  doc,
  title,
  readerLabel,
  jumps,
  openAt,
  above,
  alsoOpen,
}: {
  /** The `doc` key served by /api/admin/medjobs/sop. */
  doc: string;
  title: string;
  /** Names what the embedded document is, directly above it. */
  readerLabel: string;
  jumps: SopJump[];
  /** Where the reader opens. */
  openAt: SopJump;
  /** Rendered between the header and the jump bar, given the jump function so
   *  a diagram above the reader can drive it. */
  above?: (jump: (dest: string) => void) => React.ReactNode;
  /** A second document worth reaching from this tab, shown beside the title
   *  in the same way as the walkthrough. */
  alsoOpen?: { label: string; doc: string };
}) {
  const url = `/api/admin/medjobs/sop?doc=${doc}`;
  const [hash, setHash] = useState(() => sopHash(openAt));
  const frame = useRef<HTMLDivElement>(null);

  // Two scrolls, and both matter. The hash moves the PDF to the section; this
  // moves the browser so the reader is what you are looking at, rather than
  // leaving you at the top of a page that has a diagram and an index above it.
  const jump = useCallback((next: string) => {
    setHash(next);
    frame.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div>
      <AdminPageHeader
        title={title}
      />

      {above ? (
        <div className="mb-6">{above((dest) => jump(`nameddest=${dest}`))}</div>
      ) : null}

      <div ref={frame} className="scroll-mt-4">
        <div className="mb-2 flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-900">{readerLabel}</h2>
          <a
            href={VIDEO}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:text-primary-800"
          >
            <LinkIcon />
            Walkthrough
          </a>
          {alsoOpen ? (
            <a
              href={`/api/admin/medjobs/sop?doc=${alsoOpen.doc}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:text-primary-800"
            >
              <LinkIcon />
              {alsoOpen.label}
            </a>
          ) : null}
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2">
          {jumps.map((j) => {
            const h = sopHash(j);
            return (
              <span key={j.label} className="flex items-center gap-1.5">
                {j.divide ? <span className="mx-1 h-4 w-px bg-gray-200" aria-hidden /> : null}
                <button
                  type="button"
                  title={j.title}
                  aria-current={hash === h ? "page" : undefined}
                  onClick={() => jump(h)}
                  className={`rounded-md border px-2 py-1 text-xs font-medium tabular-nums transition-colors ${
                    hash === h
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {j.label}
                </button>
              </span>
            );
          })}
        </div>

        {/* The key remounts the iframe on a jump: a changed hash alone does not
            move an already-loaded PDF viewer. */}
        <iframe
          key={hash}
          src={`${url}#${hash}`}
          title={title}
          className="h-[calc(100vh-16rem)] min-h-[32rem] w-full rounded-lg border border-gray-200 bg-gray-50"
        />
      </div>
    </div>
  );
}

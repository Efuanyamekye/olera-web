"use client";

import { useState } from "react";

/**
 * A suggested message the manager can read, edit and copy. Copy only: this
 * workspace does not send mail, and pretending otherwise would put a send
 * path in front of someone that does not exist.
 */
export default function Copyable({
  label,
  subject,
  body,
}: {
  label: string;
  subject?: string;
  body: string;
}) {
  const [text, setText] = useState(subject ? `Subject: ${subject}\n\n${body}` : body);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable; the text is selectable either way */
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-2">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
        <button
          type="button"
          onClick={() => void copy()}
          className="rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={Math.min(14, text.split("\n").length + 1)}
        className="w-full resize-y rounded border border-gray-200 bg-white p-2 font-mono text-[12px] leading-relaxed text-gray-800 focus:border-primary-400 focus:outline-none"
      />
    </div>
  );
}

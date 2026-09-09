"use client";

import { useEffect } from "react";

/**
 * The success moment. Inline where the work happened, not a modal, and
 * gone in a few seconds: someone activating four organizations in a row
 * should not have to dismiss four dialogs.
 */
export default function SuccessToast({
  title,
  detail,
  onDone,
}: {
  title: string;
  detail?: string;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 4000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div
      role="status"
      className="my-2 flex items-start gap-2 rounded-lg border border-success-200 bg-success-50 px-3 py-2"
    >
      <span className="mt-0.5 text-success-700" aria-hidden>
        &#10003;
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-success-900">{title}</p>
        {detail ? <p className="text-[12px] text-success-800">{detail}</p> : null}
      </div>
    </div>
  );
}

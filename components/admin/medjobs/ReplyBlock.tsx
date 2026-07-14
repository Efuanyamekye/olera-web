"use client";

/**
 * ReplyBlock — the provider's actual incoming reply (captured into the
 * email_replied touchpoint), shown above the reply outcome cards.
 *
 * Renders the FULL message with a Show more/less toggle so long replies aren't
 * cut off, and strips HTML noise (script/style blocks, tags, entities) so
 * structured-data emails don't show raw JSON-LD.
 */

import { useState } from "react";

type Reply = { created_at: string; payload: Record<string, unknown> | null } | null;

/** Strip HTML down to readable text: remove script/style/head blocks entirely
 *  (they carry JSON-LD / CSS, not message text), then tags + common entities. */
function cleanReplyText(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

const PREVIEW_LIMIT = 400;

export function ReplyBlock({ reply }: { reply: Reply }) {
  const [expanded, setExpanded] = useState(false);
  const p = reply?.payload ?? {};

  // Prefer the full reply_body (so "Show more" reveals the whole message);
  // fall back to the (possibly truncated) preview_text.
  const raw =
    (typeof p.reply_body === "string" && p.reply_body.trim()) ||
    (typeof p.preview_text === "string" ? p.preview_text : "");
  const text = cleanReplyText(raw);

  // Show the PROVIDER's address (recipient_email), not from_email — Smartlead's
  // reply payload puts our own sender in from_email, which would mislabel it.
  const from =
    (typeof p.recipient_email === "string" && p.recipient_email.trim()) ||
    (typeof p.from_email === "string" && p.from_email.trim()) ||
    null;

  const isLong = text.length > PREVIEW_LIMIT;
  const shown = expanded || !isLong ? text : `${text.slice(0, PREVIEW_LIMIT).trimEnd()}…`;

  return (
    <section className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
        {reply ? `✉ They replied${from ? ` · ${from}` : ""}` : "✉ Reply"}
      </p>
      {reply ? (
        text ? (
          <>
            <p className="mt-1 max-h-64 overflow-y-auto whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-gray-700">
              {shown}
            </p>
            {isLong && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-1 text-[11px] font-medium text-primary-600 hover:underline"
              >
                {expanded ? "Show less" : "Show more"}
              </button>
            )}
          </>
        ) : (
          <p className="mt-1 text-[12px] leading-relaxed text-gray-500">
            Reply received — open Smartlead to read the full message.
          </p>
        )
      ) : (
        <p className="mt-1 text-[12px] leading-relaxed text-gray-500">
          No reply yet — open Smartlead to check the full thread.
        </p>
      )}
    </section>
  );
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoredItem } from "@/lib/war-room/inbox-operator.server";

/**
 * "check 5 6": an adversarial pass over an inbox draft before he sends it.
 *
 * TJ, 2026-09-28, on Telegram: "For text messages 5 and 6, do an adversarial
 * check with Perplexity on your draft and let me know the results." Cortex
 * could not: it had no way to call Perplexity. Run by hand, the check found
 * draft 6 gave CFCAA's main line without the "x222" its own weatherization
 * page asks for. This is that hand check (scripts/attack-draft.js), wired to
 * the digest. Objections only; the draft is never rewritten here, and the item
 * stays open so he can "send 6" or "send 6: edited text" after reading it.
 */

const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";

// Same rules as scripts/attack-draft.js, which is the hand procedure's checker.
const SYSTEM = `You fact-check a draft message that a free senior-care service is about to send to a family or a care provider. You are not rewriting it. Return objections only.

Rules:
- Attack FACTUAL claims: phone numbers and extensions, hours, days, deadlines, age thresholds, income limits, program names, which agency does what, and whether a program EXISTS in that state, SERVES that area, and is OPEN today.
- For every objection, FETCH the administering agency's own page and QUOTE the sentence that contradicts the draft. A search summary is not a source. If you cannot find an agency source, say so and mark the objection unsourced.
- Do NOT object to tone, length, hedging, formatting, or the absence of caveats.
- Do NOT invent restrictions. Pay attention to WHO IS WHO.
- If a claim is correct, OMIT IT ENTIRELY. Never return an objection whose problem says the claim is "supported", "confirmed", or "not contradicted".
- Every objection must be one of: (a) the agency page CONTRADICTS the draft, or (b) the claim is material and you could find NO agency source for it.
- Returning zero objections is a valid and useful answer.

Return ONLY JSON:
{"objections":[{"target":"exact phrase from the draft","problem":"what is wrong","source_quote":"verbatim sentence from the agency page","source_url":"https://...","confidence":"high|medium|low"}]}`;

export type Objection = { target: string; problem: string; sourceQuote: string; sourceUrl: string; confidence: "high" | "medium" | "low" };

/** Perplexity returns "supported" rows despite the rule (it did on 28 Sep, for all three of draft 5's). They are not objections. */
export function isRealObjection(problem: string): boolean {
  // "Not supported by any agency page" IS an objection, so only a problem that
  // opens with the verdict, or says nothing contradicts it, is dropped.
  return !/^(supported|confirmed|correct|accurate)\b|no contradiction|not contradicted/i.test(problem.trim());
}

/** Perplexity echoes page text with HTML entities ("it&#39;s"), which Telegram shows raw. */
const decode = (text: string) => text
  .replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

export function parseObjections(content: string): Objection[] {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("the checker did not return JSON");
  const parsed = JSON.parse(content.slice(start, end + 1)) as { objections?: Array<Record<string, unknown>> };
  return (parsed.objections ?? [])
    .map((row) => ({
      target: decode(String(row.target ?? "")).trim(),
      problem: decode(String(row.problem ?? "")).trim(),
      sourceQuote: decode(String(row.source_quote ?? "")).trim(),
      sourceUrl: String(row.source_url ?? "").trim(),
      confidence: (["high", "medium", "low"].includes(String(row.confidence)) ? row.confidence : "low") as Objection["confidence"],
    }))
    .filter((row) => row.problem && isRealObjection(row.problem));
}

/** Who the draft is for and what they said, from the family's profile or the email thread. */
async function draftContext(db: SupabaseClient, item: StoredItem): Promise<{ who: string; message: string }> {
  const said = item.summary.match(/They said: "([\s\S]*)"\s*$/)?.[1] ?? "";
  if (item.kind === "sms_draft") {
    const last10 = String(item.target.last10 ?? "");
    const { data: job } = await db.from("family_answer_jobs")
      .select("body, packet")
      .eq("phone_last10", last10)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const facts = ((job?.packet as { facts?: Array<{ label?: string; value?: unknown }> } | null)?.facts ?? [])
      .filter((fact) => fact.label && !/^(Told us directly|Sent this on its own)$/.test(fact.label))
      .map((fact) => `${fact.label}: ${String(fact.value)}`);
    return {
      who: `A person texting a senior-care benefits line about their own or a relative's care. ${facts.join("; ") || "No profile on file."}`,
      message: (job?.body as string | undefined) || said || "(not stored)",
    };
  }
  const { data: messages } = await db.from("support_email_messages")
    .select("body_text, snippet, direction, internal_date")
    .eq("thread_id", String(item.target.threadId ?? ""))
    .eq("direction", "in")
    .order("internal_date", { ascending: false })
    .limit(1);
  const last = (messages ?? [])[0] as { body_text: string | null; snippet: string | null } | undefined;
  return {
    who: item.summary,
    message: (last?.body_text ?? last?.snippet ?? "").replace(/\s+/g, " ").trim().slice(0, 2_000) || "(not stored)",
  };
}

export async function checkDraft(db: SupabaseClient, item: StoredItem): Promise<Objection[]> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error("no Perplexity key is configured");
  const { who, message } = await draftContext(db, item);
  const user = [
    `WHO: ${who}`,
    "",
    "THEIR OWN MESSAGE, verbatim:",
    message,
    "",
    `TODAY IS ${new Date().toISOString().slice(0, 10)}.`,
    "",
    "THE DRAFT:",
    item.body ?? "",
  ].join("\n");
  const res = await fetch(PERPLEXITY_URL, {
    method: "POST",
    signal: AbortSignal.timeout(100_000),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "sonar",
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }],
      max_tokens: 2_000,
      temperature: 0,
    }),
  });
  if (!res.ok) throw new Error(`the checker answered ${res.status}`);
  const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return parseObjections(body.choices?.[0]?.message?.content ?? "");
}

/** One block per draft for Telegram. Contradictions first; "no source found" is labelled as such, not as an error. */
export function renderCheck(item: StoredItem, objections: Objection[] | Error): string {
  if (objections instanceof Error) return `${item.number}: couldn't check it (${objections.message}). It's still open.`;
  if (!objections.length) return `${item.number}: clean. Nothing contradicted by an agency page. "send ${item.number}" when you're ready.`;
  const order = { high: 0, medium: 1, low: 2 };
  const rows = [...objections].sort((a, b) => order[a.confidence] - order[b.confidence]).map((objection) => {
    const quote = objection.sourceQuote && !/^no agency source/i.test(objection.sourceQuote) ? `\n  Source says: "${objection.sourceQuote.slice(0, 240)}"` : "";
    const url = objection.sourceUrl ? `\n  ${objection.sourceUrl}` : "";
    return `• [${objection.confidence}] "${objection.target.slice(0, 120)}": ${objection.problem.slice(0, 300)}${quote}${url}`;
  });
  return `${item.number}: ${objections.length} ${objections.length === 1 ? "objection" : "objections"}.\n${rows.join("\n")}\nStill open: "send ${item.number}", or "send ${item.number}: your edited text".`;
}

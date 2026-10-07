/**
 * Cheap, deterministic intent gates for the Twilio webhook.
 *
 * The webhook cannot wait minutes for the Family Answers model before deciding
 * whether to send an acknowledgement. This gate handles only the safest case:
 * a message whose entire meaning is conversational closure. Anything with a
 * question, problem, contrast, or additional detail deliberately falls through
 * to the normal human/research path.
 */

function normalize(body: string): string {
  return body
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[‘’ʼ']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const COURTESY_ONLY = [
  /^(?:thank you|thanks|thx)(?: so (?:very )?much| very much| again)?$/,
  /^(?:many thanks|much appreciated|appreciate it|i appreciate it)$/,
  /^(?:ok|okay|got it|understood|sounds good|all right|perfect|great|will do)(?: thank you| thanks| thx)?$/,
  /^(?:thank you|thanks|thx) (?:got it|will do|sounds good|i appreciate it)$/,
  /^(?:thank you|thanks) for (?:your |the )?(?:help|reply|response|answer|guidance|information|info|time|number)$/,
  /^(?:thank you|thanks) for get(?:ting)? back to me$/,
  /^(?:thank you|thanks) i will call (?:them|the agency|that number)(?: tomorrow| today| now)?$/,
];

/**
 * True only for a high-confidence courtesy/acknowledgement with no new need.
 * This is intentionally an allowlist rather than a sentiment classifier: a
 * false negative causes one unnecessary acknowledgement, while a false
 * positive can hide a real request for help.
 */
export function isCourtesyOnlyReply(body: string | null | undefined): boolean {
  if (!body) return false;
  const text = normalize(body);
  return Boolean(text) && COURTESY_ONLY.some((pattern) => pattern.test(text));
}

/**
 * An iMessage / Android tapback, not a message. iOS delivers a reaction to a
 * non-iMessage thread as text: `Liked "…"`, `Loved "…"`, `Removed 👍 from
 * "…"`. On 2026-09-11 one of those got "We're looking into this and will get
 * back to you", which reads as a bot that did not read anything.
 */
const REACTION_PATTERNS: RegExp[] = [
  /^(?:liked|loved|disliked|laughed at|emphasized|emphasised|questioned)\s+["“”‘’]/i,
  /^removed\s+(?:a\s+)?\S+(?:\s+\S+)?\s+from\s+["“”‘’]/i,
  /^reacted\s+\S+(?:\s+\S+)?\s+to\s+["“”‘’]/i,
];

export function isReactionOnly(body: string | null | undefined): boolean {
  if (!body) return false;
  const text = body.trim().replace(/[​-‍﻿]/g, "");
  return REACTION_PATTERNS.some((re) => re.test(text));
}

/** No letters or digits at all: "?", an emoji, a stray punctuation mark.
 *  Worth a human glance, never a "we're researching your question" reply. */
export function hasNoWords(body: string | null | undefined): boolean {
  if (!body) return true;
  return !/[A-Za-z0-9À-ɏ]/.test(body);
}

/**
 * "Stop no longer needed", "STOP texting me". A sentence that opens with
 * STOP or UNSUBSCRIBE is an opt-out, even though it is not the bare keyword
 * the carrier recognises. Kept to short messages that START with the word so
 * "please don't stop helping me" is never read as one.
 */
export function isOptOutPhrase(body: string | null | undefined): boolean {
  if (!body) return false;
  const words = body
    .trim()
    .toUpperCase()
    .replace(/[^A-Z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0 || words.length > 6) return false;
  return words[0] === "STOP" || words[0] === "STOPALL" || words[0] === "UNSUBSCRIBE";
}

/**
 * The outcome vocabulary the benefits texts actually invite.
 *
 * The webhook's `keyword` is the whole body uppercased with every non-letter
 * stripped, which turns "NO ANSWER" into the token NOANSWER that
 * interpretBenefitsSmsReply switches on. That works only when the family
 * replies with one exact phrase and nothing else.
 *
 * On 2026-08-31 a care seeker answered "Reply CALLED, NO ANSWER, or STUCK"
 * with "No Stuck". It collapsed to NOSTUCK, matched no case, was stored with a
 * null keyword, and her plan never recorded that she was stuck. People handed a
 * three-option menu do not reliably reply with exactly one token, so the parser
 * has to read words rather than one concatenated blob.
 *
 * Substring matching is NOT the fix and would be worse than the bug: NOTSTUCK
 * contains STUCK, so "not stuck" would be recorded as its own opposite.
 */
const FILLER = new Set([
  "I", "IM", "IVE", "AM", "WE", "THEY", "IT", "THE", "A", "STILL", "YET", "JUST",
  "REALLY", "VERY", "SO", "AND", "BUT", "THEM", "HIM", "HER", "THIS", "THAT",
  "PLEASE", "THANKS", "THANK", "YOU", "SORRY", "OK", "OKAY", "HI", "HELLO",
]);

/** A word that flips the meaning of whatever follows it. */
const NEGATORS = new Set(["NO", "NOT", "NEVER", "DIDNT", "DONT", "DOESNT", "ISNT", "WASNT", "CANT", "AINT"]);

/** Phrases first: a two-word outcome must win before its parts are read alone. */
const PHRASES: [string[], string][] = [
  [["NO", "ANSWER"], "NOANSWER"],
  [["NO", "ONE", "ANSWERED"], "NOANSWER"],
  [["NOBODY", "ANSWERED"], "NOANSWER"],
  [["DIDNT", "ANSWER"], "NOANSWER"],
  [["NEED", "DOCS"], "NEEDDOCS"],
  [["NEED", "DOCUMENTS"], "NEEDDOCS"],
  [["NOT", "ELIGIBLE"], "NOTELIGIBLE"],
];

const SINGLES: Record<string, string> = {
  CALLED: "CALLED",
  STUCK: "STUCK",
  APPLIED: "APPLIED",
  WAITING: "WAITING",
  NOANSWER: "NOANSWER",
  NEEDDOCS: "NEEDDOCS",
  NOTELIGIBLE: "NOTELIGIBLE",
  INELIGIBLE: "NOTELIGIBLE",
  DENIED: "NOTELIGIBLE",
  APPROVED: "APPROVED",
};

export interface OutcomeMatch {
  /** The vocabulary token, when exactly one unambiguous outcome was meant. */
  keyword: string | null;
  /**
   * True when the reply clearly responds to the outcome prompt but we cannot
   * say which outcome. Never guessed: an ambiguous reply is routed to a human
   * instead, because recording the wrong status silently moves a family's plan
   * to a state nobody chose.
   */
  ambiguous: boolean;
}

export function matchOutcomeReply(body: string | null | undefined): OutcomeMatch {
  const words = (body || "")
    // Apostrophes close up rather than split, so "I'm" reads as IM and stays
    // filler instead of leaving a stray "M" that looks like a content word.
    .replace(/[\u2018\u2019\u02BC']/g, "")
    .toUpperCase()
    .replace(/[^A-Z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return { keyword: null, ambiguous: false };

  const found: string[] = [];
  let negated = false;

  for (let i = 0; i < words.length; i++) {
    const phrase = PHRASES.find((entry) =>
      entry[0].every((w, k) => words[i + k] === w),
    );
    if (phrase) {
      found.push(phrase[1]);
      i += phrase[0].length - 1;
      continue;
    }
    const single = SINGLES[words[i]];
    if (single) {
      found.push(single);
      // "not stuck" and "no stuck" both land here. The first is a denial, the
      // second is almost certainly "no, and I am stuck" — and almost certainly
      // is not good enough to write into someone's plan.
      const prev = words[i - 1];
      if (prev && NEGATORS.has(prev)) negated = true;
      continue;
    }
    // A negator is a recognized word, not an unknown one. It must survive to
    // qualify the keyword that follows it rather than bailing out here — that
    // bail is what let "No Stuck" fall through to free-form in the first place.
    if (NEGATORS.has(words[i]) || FILLER.has(words[i])) continue;
    // An unrecognized content word means this is a sentence, not a menu pick.
    // Leave it to the free-form path rather than mining it for a keyword.
    return { keyword: null, ambiguous: false };
  }

  const distinct = [...new Set(found)];
  if (distinct.length === 1 && !negated) return { keyword: distinct[0], ambiguous: false };
  if (distinct.length >= 1) return { keyword: null, ambiguous: true };
  return { keyword: null, ambiguous: false };
}

/** The model triage categories that warrant the expensive research/draft path. */
export function familyAnswerCategoryNeedsDraft(category: string | null | undefined): boolean {
  return category !== "thanks" && category !== "unrelated";
}

/** Only pure conversational closure is safe to remove from the human queue. */
export function familyAnswerCategoryAutoCloses(category: string | null | undefined): boolean {
  return category === "thanks";
}

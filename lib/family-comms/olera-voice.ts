/**
 * Letters and texts to families speak as Olera, never as TJ.
 *
 * TJ, 2026-09-30: "We have more to lose than gain by putting the names. This
 * is a free benefits finder, and there's a certain degree of liability and
 * personalization that we don't want to take on." New navigator letters are
 * composed in Olera's voice. This converts the parts that name him in letters
 * drafted before that change ("Hi, it's TJ with Olera.", the "TJ / Olera"
 * sign-off, "My team and I read every reply"), without a model call, at the
 * points where a letter is shown or sent. Pure, so the admin drawer and the
 * send path apply the same rewrite.
 */
export function inOleraVoice(text: string): string {
  if (!text) return text;
  return text
    // Openers: "Hi Maria, it's TJ with Olera." / "Hi, it's TJ from Olera."
    .replace(/\bit[’']s TJ (?:with|from|at) Olera\b/gi, "this is Olera")
    .replace(/\bthis is TJ (?:with|from|at) Olera\b/gi, "this is Olera")
    .replace(/\bI[’']m TJ (?:with|from|at) Olera\b/gi, "this is Olera")
    .replace(/\bTJ (?:from|with|at) Olera\b/g, "Olera")
    // Who reads replies.
    .replace(/\bMy team and I read every reply\b/g, "A person on our team reads every reply")
    .replace(/\bmy team and I read every reply\b/g, "a person on our team reads every reply")
    // Sign-off: "TJ" alone on a line, with or without "Olera" under it.
    .replace(/\n[ \t]*TJ[ \t]*\n[ \t]*Olera[ \t]*$/i, "\nOlera")
    .replace(/\n[ \t]*TJ,?[ \t]*Olera[ \t]*$/i, "\nOlera")
    .replace(/\n[ \t]*TJ[ \t]*$/i, "\nOlera")
    // Text messages: "Olera (TJ):" or "TJ from Olera:" prefixes.
    .replace(/^TJ (?:from|at) Olera:/i, "Olera:");
}

/** True when a letter still names TJ as its sender (for checks and counts). */
export function writtenAsTj(text: string | null | undefined): boolean {
  return /\bit[’']s TJ\b|\bTJ (?:with|from|at) Olera\b|\n[ \t]*TJ[ \t]*(?:\n|$)/i.test(text ?? "");
}

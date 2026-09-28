/**
 * "send that to Logan": a message from the founder to a teammate, sent by the
 * system on his explicit command, never by the model.
 *
 * TJ, 2026-09-28: Cortex drafted a context note for Logan before the Robbie
 * call and said "I can't send Logan anything, not Slack and not email, so
 * here's the note to paste." He pasted it into Slack by hand, then: "The
 * Robbie message I sent you was to highlight the lack of ability to send
 * Logan a message. We need that."
 *
 * The bot could already post DMs (the brief reaches him that way), so no
 * Slack permission changed. The message goes out as the Cortex app, headed
 * "From TJ", so Logan knows whose words they are. Only the people listed here
 * can be messaged; adding one is a code change.
 */

export const TEAM: Record<string, { name: string; slackUserId: string }> = {
  logan: { name: "Logan", slackUserId: "U013S7E67RN" },
};

export type TeamMessageCommand = { to: keyof typeof TEAM; text: string | null };

const NAMES = Object.keys(TEAM).join("|");

/**
 * "send to Logan: <text>", "tell Logan: <text>" send the text as written.
 * "send that to Logan", "send it to Logan" send the note Cortex just drafted
 * (text: null). Only at the start of a message; "should I send that to
 * Logan?" is a question.
 */
export function parseTeamMessage(text: string): TeamMessageCommand | null {
  const trimmed = text.trim();
  const withText = trimmed.match(new RegExp(`^(?:send|message|tell|dm)\\s+(?:to\\s+)?(${NAMES})\\s*:\\s*([\\s\\S]+)$`, "i"));
  if (withText) return { to: withText[1].toLowerCase() as keyof typeof TEAM, text: withText[2].trim() };
  const drafted = trimmed.match(new RegExp(`^(?:ok(?:ay)?[,.]?\\s+|yes[,.]?\\s+)?send\\s+(?:that|it|this|the (?:note|message|draft))\\s+to\\s+(${NAMES})(?:\\s+(?:now|please))?[.!]?$`, "i"));
  if (drafted) return { to: drafted[1].toLowerCase() as keyof typeof TEAM, text: null };
  return null;
}

/**
 * The note Cortex drafted, from its last message: the longest double-quoted
 * passage. Cortex is told to put a note for a teammate in quotes. Null when
 * there is none, so nothing is guessed at and sent.
 */
export function draftedNote(cortexMessage: string): string | null {
  const quoted = [...cortexMessage.matchAll(/["“]([\s\S]{40,}?)["”](?=\s|$|[.,;:!?])/g)].map((match) => match[1].trim());
  if (!quoted.length) return null;
  return quoted.sort((a, b) => b.length - a.length)[0];
}

export function teamMessageText(text: string): string {
  return `*From TJ* (sent through Cortex):\n\n${text}`;
}

/**
 * What a benefits family needs from a person, for the case workspace's
 * queues (lib/seeker-touches/queues.ts): Urgent, Letter to read, Help due.
 *
 * Pure, read off business_profiles.metadata, so the family list can compute
 * it for every row without another query. Until 2026-09-28 the only place to
 * find a letter waiting for TJ's read (39 of them that day) was the Families
 * view on /admin/benefits.
 */

export interface BenefitsQueueSignals {
  /** A drafted letter whose verdict wants a person: route review or ask. */
  letter_to_read: boolean;
  /** Why it is waiting, when the verdict said ("letter states a dollar figure"). */
  letter_reason: string | null;
  /** Open help case (STUCK, "I'd like help", urgent answer): when it's due. */
  help_due_at: string | null;
  help_overdue: boolean;
  /** They told the companion something is urgent, in the last 7 days, and no
   *  person has reached them since. */
  urgent_at: string | null;
}

const DAY = 24 * 60 * 60 * 1000;

export function benefitsQueueSignals(
  meta: Record<string, unknown> | null | undefined,
  now = Date.now(),
): BenefitsQueueSignals | null {
  const m = (meta || {}) as Record<string, unknown>;
  const nav = m.benefits_navigator as
    | { status?: string; scheduled_at?: string | null; packet?: { route?: string; holds?: string[] } | null }
    | undefined;
  const help = m.benefits_case as
    | { help_opened_at?: string; help_due_at?: string; resolved_at?: string; contacted_at?: string }
    | undefined;
  const companion = m.benefits_companion as { urgency?: { answer?: string; at?: string } | null } | undefined;

  const route = nav?.packet?.route ?? null;
  const letterToRead = nav?.status === "pending" && !nav.scheduled_at && (route === "review" || route === "ask");

  const helpOpen = !!help?.help_opened_at && !(help.resolved_at && help.resolved_at > help.help_opened_at);
  const helpDue = helpOpen ? help?.help_due_at ?? help?.help_opened_at ?? null : null;

  const urgency = companion?.urgency;
  const reachedAfter = (at: string) =>
    (help?.contacted_at && help.contacted_at > at) || (help?.resolved_at && help.resolved_at > at);
  const urgentAt =
    urgency?.answer === "yes" && urgency.at && now - Date.parse(urgency.at) < 7 * DAY && !reachedAfter(urgency.at)
      ? urgency.at
      : null;

  if (!letterToRead && !helpDue && !urgentAt) return null;
  return {
    letter_to_read: letterToRead,
    letter_reason: letterToRead ? (nav?.packet?.holds?.[0] ?? null) : null,
    help_due_at: helpDue,
    help_overdue: !!helpDue && Date.parse(helpDue) < now,
    urgent_at: urgentAt,
  };
}

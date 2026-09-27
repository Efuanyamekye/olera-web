/**
 * Pure, client-safe helpers for the "make the call" step, shared by the plan
 * page (/m/{token}), the navigator letter and the program-page card, so the
 * number a family is told to call is the same everywhere.
 */

export interface DraftContact {
  label: string;
  description?: string | null;
  phone?: string | null;
  hours?: string | null;
}

export interface CallContact {
  label: string;
  phone: string;
  hours: string | null;
  description: string | null;
}

/**
 * The contact a first step calls: the pipeline draft's "start here" contact
 * when it has a phone, else the first contact with a phone. Same rule the
 * first-step selector (toPick) has always used.
 */
export function pickCallContact(contacts: DraftContact[] | null | undefined): CallContact | null {
  const list = contacts || [];
  const c = list.find((x) => x.phone && /start here/i.test(x.label)) || list.find((x) => !!x.phone);
  if (!c?.phone) return null;
  return {
    label: c.label,
    phone: c.phone,
    hours: c.hours ?? null,
    description: c.description ?? null,
  };
}

/** Two spoken lines the family can read off the screen. `relationship` is
 *  whatever the caller holds: the card's display value ("Self", "Parent",
 *  "Spouse", "Family member") or the stored profile value
 *  (metadata.relationship_to_recipient: "Myself", "My parent", "My spouse",
 *  "Someone else"). Only the first set used to match, so the plan page and
 *  the letter told 306 families who picked "Myself" to say "for a family
 *  member" (found 2026-09-27). */
export function buildCallScript(programShortName: string, relationship: string | null): string {
  const r = (relationship || "").trim().toLowerCase().replace(/^my\s+/, "");
  const forWhom =
    r === "self" || r === "myself"
      ? "for myself"
      : r === "spouse"
        ? "for my spouse"
        : r === "parent"
          ? "for my parent"
          : "for a family member";
  return `Hi, I'm calling to ask about ${programShortName}. I'd like to apply ${forWhom}. Could you help me get started, or point me to the right person?`;
}

/** Drop a trailing "(start here)"-style parenthetical from a contact label. */
export function stripParen(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "");
}

/** Draft `hours` values are free text; some are sentinels like "Contact for
 *  hours". Only show values that look like actual hours. */
export function looksLikeHours(h: string): boolean {
  return /\d|am|pm|mon|tue|wed|thu|fri|sat|sun|daily|hour|weekday/i.test(h) && !/contact/i.test(h);
}

/** tel: href from a human-formatted phone ("2-1-1", "(877) 399-8939"). */
export function telHref(phone: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length === 10) return `tel:+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `tel:+${digits}`;
  return `tel:${digits}`;
}

/**
 * What to call a family row.
 *
 * THE PROBLEM THIS SOLVES. 1,418 of 2,041 `business_profiles` rows with
 * type='family' have the literal display_name "Care Seeker" — the placeholder
 * every intake path writes when the family did not give a name. On a provider
 * list that never happens, because a provider row is a business with a name on
 * a sign. On a family list it means two thirds of the rows are identical, and a
 * list of forty lines that all read "Care Seeker" cannot be used for anything.
 *
 * So the label falls through: a real name, else the email they gave us, else
 * the last four digits of the phone, else the city. Each fallback is something
 * a human can actually use to tell one row from the next and to act on it.
 *
 * NO INVENTION. We do not prettify an email stem into a guessed human name
 * ("valdezlorene0" → "Valdez Lorene"). A wrong name is worse than an honest
 * address, and this is a screen where someone is about to phone a stranger.
 * `is_fallback` is returned so the UI can render a fallback in a way that does
 * not read as a name.
 *
 * Pure and client-safe.
 */

/**
 * Placeholders written by intake paths when no name was given. Compared
 * case-insensitively, after trimming.
 */
const PLACEHOLDER_NAMES = new Set([
  "care seeker",
  "careseeker",
  "family",
  "unknown",
  "anonymous",
  "n/a",
  "-",
]);

export function isPlaceholderName(name: string | null | undefined): boolean {
  const n = (name ?? "").trim().toLowerCase();
  if (!n) return true;
  return PLACEHOLDER_NAMES.has(n);
}

export type LabelInput = {
  display_name?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
};

export type SeekerLabel = { label: string; is_fallback: boolean };

/** Last four digits, for a phone we can show but not name. */
function last4(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

/**
 * The label for one family row, plus whether it is a real name.
 *
 * Order: given name → email → phone → place → the id's short form, which is the
 * last resort and still beats forty identical rows.
 */
export function seekerLabel(p: LabelInput, id?: string): SeekerLabel {
  const given = (p.display_name ?? "").trim();
  if (!isPlaceholderName(given)) return { label: given, is_fallback: false };

  const email = (p.email ?? "").trim();
  if (email) return { label: email, is_fallback: true };

  const four = last4(p.phone);
  if (four) return { label: `Phone ending ${four}`, is_fallback: true };

  const place = [p.city, p.state].filter(Boolean).join(", ");
  if (place) return { label: `Unnamed family · ${place}`, is_fallback: true };

  return { label: `Unnamed family · ${(id ?? "").slice(0, 8) || "no id"}`, is_fallback: true };
}

// ── Phone plausibility ────────────────────────────────────────────────────────

/**
 * True when a number cannot exist in the North American Numbering Plan.
 *
 * Neither the area code nor the exchange may begin with 0 or 1. `normalizeUSPhone`
 * in lib/twilio.ts does not check this, which is how a city lead was stored as
 * +11214870172 (area code "121") on 12 Sep 2026: every text to her failed at
 * Twilio, her email bounced, and the admin queue still listed her as a call to
 * make rather than a person we had no way to contact.
 *
 * This function is the *read-side* guard — it makes the condition visible on the
 * Relationships row. The write-side fix in normalizeUSPhone is a separate change
 * and this does not substitute for it.
 */
export function isImpossibleUsPhone(phone: string | null | undefined): boolean {
  let digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return false;
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) return true;
  const area = digits[0];
  const exchange = digits[3];
  return area === "0" || area === "1" || exchange === "0" || exchange === "1";
}

/** Last ten digits — the key do_not_contact and sms_inbound both use. */
export function last10(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

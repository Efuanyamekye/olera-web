/**
 * US phone validation, shared by the browser and the server.
 *
 * Deliberately dependency-free and separate from lib/twilio.ts, which pulls in
 * the Twilio SDK. A client component can import this; it cannot import that.
 *
 * The landing form and the city-leads route MUST apply the same rule. If the
 * page is looser than the route, a visitor fills the whole form in, presses
 * submit, and gets a 400 back. That is the worst possible moment to lose
 * someone who is asking for help.
 */

/**
 * North American Numbering Plan format, NXX-NXX-XXXX.
 *
 * The area code and the exchange code must each begin 2-9, and an N11 area
 * code (211, 311 ... 911) is a service code that is never assigned to a
 * subscriber.
 *
 * Ten digits on its own is not enough, and that gap was not theoretical: a
 * family typed "1214870172" into the Dallas landing page on 2026-09-11. Ten
 * digits, so the form accepted it and the route stored "+11214870172". Area
 * code 121 cannot exist, the carrier rejected her confirmation text, and the
 * only reason she was reachable at all is that she volunteered an email
 * nothing had asked her for.
 */
const NANP_10_DIGIT = /^[2-9](?!11)\d{2}[2-9]\d{6}$/;

/**
 * The ten significant digits of a dialable US number, or null.
 * Accepts a leading country code 1 and any punctuation.
 */
export function usPhoneDigits(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return NANP_10_DIGIT.test(local) ? local : null;
}

/** Whether a number can actually be dialed. Use this for form validation. */
export function isDialableUSPhone(phone: string | null | undefined): boolean {
  return usPhoneDigits(phone) !== null;
}

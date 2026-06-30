/**
 * SMS consent disclosure — the carrier-required opt-in language shown wherever
 * we collect a phone number that may receive texts. Carriers (T-Mobile in
 * particular) require, at the point of collection: the program/brand, what kind
 * of messages, that frequency varies, "Msg & data rates may apply," STOP/HELP,
 * and links to Terms + Privacy. A2P 10DLC campaign vetting often asks for a
 * screenshot of exactly this — keep it visible next to the phone field.
 *
 * One component → identical, compliant language everywhere (benefits results,
 * provider signup, lead capture). Phrased conditionally ("If you add your
 * phone…") so it reads correctly where the phone field is optional.
 */

export function SmsConsentDisclosure({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[12px] leading-relaxed text-gray-400 ${className}`}>
      If you add your phone, you agree to receive text messages from Olera about
      your care search (such as provider replies and updates). Msg &amp; data
      rates may apply. Message frequency varies. Reply STOP to opt out, HELP for
      help. See our{" "}
      <a href="/terms" className="underline hover:text-gray-600">Terms</a> and{" "}
      <a href="/privacy" className="underline hover:text-gray-600">Privacy Policy</a>.
    </p>
  );
}

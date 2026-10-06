/**
 * The number a provider's family alerts are texted to.
 *
 * `business_profiles.phone` is the business line families see and call. Some
 * of those are office landlines that cannot take a text: on 6 Oct 2026 every
 * alert to Miracle-Lightstar failed with Twilio 30005 and every alert to
 * Assisting Hands North Texas with 30006, while both owners text from mobiles.
 * `metadata.alert_phone` holds that mobile. It changes where alerts go and
 * nothing else; the profile phone stays what families are given.
 */
export function providerAlertPhone(
  profile: { phone?: string | null; metadata?: unknown } | null | undefined,
): string | null {
  const alert = (profile?.metadata as { alert_phone?: unknown } | null | undefined)?.alert_phone;
  if (typeof alert === "string" && alert.trim()) return alert.trim();
  return profile?.phone ?? null;
}

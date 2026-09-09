/**
 * Meta (Facebook/Instagram) pixel wiring for the Olera city campaigns.
 *
 * SCOPE, deliberately narrow: the pixel loads on /care/{city} and nowhere else.
 * The Ad Boost invariant "never install a third-party pixel during setup" was
 * written for PROVIDER pages, where we would be putting Meta's tag on a page we
 * run on someone else's behalf, across the whole site. It still holds there.
 * /care/{city} is an Olera-owned landing page for an Olera-owned campaign, is
 * noindex, and exists only to receive paid traffic — so it gets the carve-out
 * and the rest of the site does not. Do not mount MetaPixel in the root layout.
 *
 * WHAT WE SEND, also deliberately narrow: the Lead event plus hashed contact
 * identifiers (email, phone, first name, ZIP, city, state). We do NOT send
 * care_type, urgency, or who the care is for. Those are health-adjacent facts
 * about a named person, Meta's own terms forbid sending health data, and the
 * hospital-pixel litigation is about exactly this. Meta's optimiser does not
 * need them: it needs to know a conversion happened and who it was.
 *
 * Everything here no-ops cleanly when the env vars are absent, so the code can
 * ship before the pixel exists in Meta Events Manager.
 */

/** Public dataset ("pixel") id. Absent = every Meta call in this module no-ops. */
export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";

export function isMetaPixelConfigured(): boolean {
  return META_PIXEL_ID.length > 0;
}

/**
 * One id shared by the browser pixel and the Conversions API call for the same
 * lead, so Meta collapses the two into one conversion instead of counting two.
 * The client mints it, sends it in the POST body, and the route hands the same
 * value to CAPI. Without this the campaign reports roughly double.
 */
export function newMetaEventId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `lead-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

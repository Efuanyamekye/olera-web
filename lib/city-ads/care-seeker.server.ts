/**
 * City lead → care seeker profile. Server only.
 *
 * WHY THIS EXISTS
 * A city lead used to be a private row that existed nowhere else in the
 * product. It could not be opened, annotated or removed, and a family who
 * later inquired through a provider page became a second, unrelated record.
 * The admin queue had no way to clear a row short of a hand-written DELETE.
 *
 * A care seeker is not a separate table — it is `business_profiles` with
 * `type='family'`, and it already supports `account_id: null` +
 * `claim_state: 'unclaimed'`, i.e. a real profile with no login behind it.
 * The city form's five questions map onto it almost exactly, so this is a
 * join, not a new concept:
 *
 *   first name  → display_name        who it is for → metadata.relationship_to_recipient
 *   phone/email → phone/email         how soon      → metadata.timeline
 *   care type   → care_types[]        note          → metadata.about_situation
 *
 * WHAT IT BUYS
 * The lead row becomes clickable through to /admin/care-seekers/{id}, which
 * already has a comms timeline, the enrichment fields worth filling during a
 * concierge call, and a delete. `city_leads.care_seeker_id` is ON DELETE
 * CASCADE, so deleting there clears the queue too — without that the profile
 * would vanish and leave the lead behind pointing at nothing.
 *
 * TWO RULES
 * 1. Never clobber an existing profile. A returning family may already be a
 *    Member with data we did not collect. We fill blanks and nothing else.
 * 2. `source` stays 'city_lead' on rows we create. The family nudge cron
 *    excludes that source (see fetchFamilyProfilesPage); without it a family
 *    we are about to phone personally starts receiving "Let providers come to
 *    you" sequences.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateUniqueSlugFromName } from "@/lib/slug";

/** The source marker that keeps these rows out of the family nudge sequences. */
export const CITY_LEAD_SOURCE = "city_lead";

/**
 * City vocabulary → profile vocabulary. The profile side is what
 * /admin/care-seekers renders, so these must match the maps in
 * lib/sync-intent-to-profile.ts rather than invent parallel wording.
 */
const RECIPIENT_TO_PROFILE: Record<string, string> = {
  self: "Myself",
  parent: "My parent",
  spouse: "My spouse",
  other: "Someone else",
};

const URGENCY_TO_TIMELINE: Record<string, string> = {
  this_week: "immediate",
  this_month: "within_1_month",
  planning: "exploring",
};

/** City payment values → the display strings /admin/care-seekers renders. */
const PAYMENT_TO_PROFILE: Record<string, string> = {
  private_pay: "Private pay",
  medicaid: "Medicaid",
  va: "Veterans benefits",
  ltc_insurance: "Long-term care insurance",
  // "unsure" maps to nothing on purpose — see the care_types note below.
};

const CARE_TYPE_TO_PROFILE: Record<string, string> = {
  home_care: "Home Care",
  assisted_living: "Assisted Living",
  // "unsure" and "medical" deliberately map to nothing. An empty care_types
  // array is honest; a guessed one gets read later as the family's own answer.
  // "medical" is the out-of-scope bucket ("nursing or medical care") and is not
  // the same as choosing a nursing home, so it must not become one here.
};

export interface CityLeadSeekerInput {
  firstName: string;
  phone: string;
  email: string | null;
  city: string;
  state: string;
  careType: string;
  careRecipient: string | null;
  urgency: string | null;
  note: string | null;
}

/** Fields we would set on a fresh profile, reused when filling an existing one. */
function profileFields(input: CityLeadSeekerInput) {
  const careLabel = CARE_TYPE_TO_PROFILE[input.careType];
  return {
    careTypes: careLabel ? [careLabel] : [],
    metadata: {
      relationship_to_recipient: input.careRecipient
        ? RECIPIENT_TO_PROFILE[input.careRecipient] ?? null
        : null,
      timeline: input.urgency ? URGENCY_TO_TIMELINE[input.urgency] ?? null : null,
      about_situation: input.note || null,
    } as Record<string, unknown>,
  };
}

/**
 * Every way this phone number might already be written down.
 *
 * `business_profiles.phone` is not normalized. Measured 8 Sep 2026 across the
 * 509 family rows that carry one: 144 E.164, 227 bare ten digits, 93 with a
 * leading 1, 29 punctuated, 16 other. An exact match on the E.164 form that
 * city_leads stores would therefore miss roughly seven of every ten families
 * we already hold, and quietly mint a duplicate profile for each.
 *
 * Matching a normalized column would be the real fix; until the column is
 * normalized, enumerate. Order is irrelevant — `.in()` matches any of them.
 */
function phoneVariants(e164: string): string[] {
  const d = e164.replace(/\D/g, "").slice(-10);
  if (d.length !== 10) return [e164];
  const [a, b, c] = [d.slice(0, 3), d.slice(3, 6), d.slice(6)];
  return Array.from(
    new Set([e164, `+1${d}`, d, `1${d}`, `${a}-${b}-${c}`, `(${a}) ${b}-${c}`, `(${a})${b}-${c}`]),
  );
}

/**
 * The same family, if we already hold them. Email is the stronger key and is
 * checked first; phone catches the common case of a form filled without one.
 * A miss creates a new profile, which is the safe failure: a duplicate row is
 * a far smaller problem than writing city-form answers over a real member's.
 */
async function findExisting(
  db: SupabaseClient,
  email: string | null,
  phone: string,
): Promise<{ id: string; care_types: string[] | null; metadata: Record<string, unknown> | null } | null> {
  const cols = "id, care_types, metadata";
  if (email) {
    const { data } = await db
      .from("business_profiles")
      .select(cols)
      .eq("type", "family")
      .eq("email", email)
      .limit(1)
      .maybeSingle();
    if (data) return data as { id: string; care_types: string[] | null; metadata: Record<string, unknown> | null };
  }
  const { data } = await db
    .from("business_profiles")
    .select(cols)
    .eq("type", "family")
    .in("phone", phoneVariants(phone))
    .limit(1)
    .maybeSingle();
  return (data as { id: string; care_types: string[] | null; metadata: Record<string, unknown> | null } | null) ?? null;
}

/**
 * Find or create the care seeker for a city lead and return its id.
 *
 * Returns null rather than throwing: a lead that is captured but unlinked is
 * recoverable (the backfill in this file's PR does exactly that), whereas a
 * throw here would fail the family's form submission over an admin nicety.
 */
export async function ensureCareSeekerForCityLead(
  db: SupabaseClient,
  input: CityLeadSeekerInput,
): Promise<string | null> {
  try {
    const fields = profileFields(input);
    const existing = await findExisting(db, input.email, input.phone);

    if (existing) {
      // Fill blanks only. Anything the family or an admin already supplied wins.
      const meta = { ...(existing.metadata ?? {}) };
      let changed = false;
      for (const [k, v] of Object.entries(fields.metadata)) {
        if (v !== null && v !== undefined && (meta[k] === null || meta[k] === undefined || meta[k] === "")) {
          meta[k] = v;
          changed = true;
        }
      }
      const patch: Record<string, unknown> = {};
      if (changed) patch.metadata = meta;
      if (!existing.care_types?.length && fields.careTypes.length) patch.care_types = fields.careTypes;
      if (Object.keys(patch).length) {
        await db.from("business_profiles").update(patch).eq("id", existing.id);
      }
      return existing.id;
    }

    const slug = await generateUniqueSlugFromName(db, input.firstName);
    const { data, error } = await db
      .from("business_profiles")
      .insert({
        account_id: null,
        type: "family",
        display_name: input.firstName,
        slug,
        email: input.email,
        phone: input.phone,
        city: input.city,
        state: input.state,
        care_types: fields.careTypes,
        claim_state: "unclaimed",
        verification_state: "unverified",
        source: CITY_LEAD_SOURCE,
        metadata: fields.metadata,
      })
      .select("id")
      .single();
    if (error || !data) {
      console.error("[city-ads/care-seeker] insert failed", error);
      return null;
    }
    return data.id as string;
  } catch (err) {
    console.error("[city-ads/care-seeker] failed", err);
    return null;
  }
}

/**
 * The two optional answers the form collects after submit (payment type and a
 * free-text note) carried onto the profile, so the concierge call opens a
 * record with the situation on it rather than a name and a number.
 *
 * Same fill-blanks-only rule: the note never overwrites an existing
 * about_situation, and a payment method is appended to the family's list
 * rather than replacing it.
 */
export async function syncCityLeadDetails(
  db: SupabaseClient,
  careSeekerId: string,
  details: { paymentType?: string | null; note?: string | null },
): Promise<void> {
  try {
    const { data: profile } = await db
      .from("business_profiles")
      .select("metadata")
      .eq("id", careSeekerId)
      .maybeSingle();
    if (!profile) return;

    const meta = { ...((profile.metadata as Record<string, unknown> | null) ?? {}) };
    let changed = false;

    if (details.note && !meta.about_situation) {
      meta.about_situation = details.note;
      changed = true;
    }
    const payment = details.paymentType ? PAYMENT_TO_PROFILE[details.paymentType] : null;
    if (payment) {
      const current = Array.isArray(meta.payment_methods) ? (meta.payment_methods as string[]) : [];
      if (!current.includes(payment)) {
        meta.payment_methods = [...current, payment];
        changed = true;
      }
    }
    if (changed) {
      await db.from("business_profiles").update({ metadata: meta }).eq("id", careSeekerId);
    }
  } catch (err) {
    console.error("[city-ads/care-seeker] detail sync failed", err);
  }
}

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * "Would you like to see the next best option?" — the one provider we offer a
 * family right after they send an inquiry (6 Oct, TJ).
 *
 * ONE option, never a list, and nothing is sent until the family taps. The
 * send-to-several card that ran in May (pre-ticked, three at once, in place of
 * the inquiry) turned 0.5 of every 1,000 viewers into an inquiry against 13.1
 * for the plain form, so this only ever appears AFTER the family's own inquiry
 * is safe, and it asks.
 *
 * DISTANCE, NOT STATE. The provider page's similar-providers lookup matches on
 * state and category, which offered two Chicago-suburb agencies for a
 * Springfield, Illinois home. This reads coordinates from the directory
 * (olera-providers.lat/lon) and drops anything past MAX_MILES. No match inside
 * the cap means no offer at all, never a far one.
 *
 * Ranking: providers with a real (non-auto) reply in the last 60 days first —
 * the same internal signal as lib/family-comms/alternatives.ts, never shown as
 * a response-time claim — then rating band (4.5+, 4.0+, unrated), then
 * distance. A provider rated under MIN_RATING is never offered; an unrated one
 * can be.
 */

const MAX_MILES = 30;
const MIN_RATING = 4.0;

export interface NextBestOption {
  /** olera-providers.provider_id — what /api/connections/request accepts. */
  providerId: string;
  slug: string;
  name: string;
  city: string | null;
  state: string | null;
  distanceMi: number;
  rating: number | null;
  reviewCount: number | null;
}

interface DirectoryRow {
  provider_id: string;
  provider_name: string | null;
  slug: string | null;
  city: string | null;
  state: string | null;
  lat: number | null;
  lon: number | null;
  provider_category: string | null;
  google_rating: number | null;
  google_reviews_data: { review_count?: number } | null;
}

function haversineMi(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Claimed and self-registered accounts store a code ("home_care_agency"); the
 * directory stores the display label. Both must land on the label the
 * directory's provider_category uses, or the lookup finds nothing.
 */
const CATEGORY_LABEL: Record<string, string> = {
  home_care: "Home Care (Non-medical)",
  home_care_agency: "Home Care (Non-medical)",
  in_home_care: "Home Care (Non-medical)",
  home_health: "Home Health Care",
  home_health_agency: "Home Health Care",
  assisted_living: "Assisted Living",
  memory_care: "Memory Care",
  nursing_home: "Nursing Home",
  skilled_nursing: "Nursing Home",
  independent_living: "Independent Living",
};

/** "Assisted Living | Memory Care" → "Assisted Living": the page's primary care type. */
function primaryCategory(raw: string | null | undefined): string | null {
  const first = (raw ?? "").split("|")[0]?.trim();
  if (!first) return null;
  return CATEGORY_LABEL[first.toLowerCase().replace(/[\s-]+/g, "_")] ?? first;
}

/** First word of a name, letters only: "Centerbridge" and "Centebridge 2" both give "cente". */
function nameStem(name: string | null | undefined): string {
  return (name ?? "").toLowerCase().replace(/[^a-z]/g, "").slice(0, 5);
}

function categories(raw: string | null | undefined): string[] {
  return (raw ?? "").split("|").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/**
 * The next best option for a family who just inquired with `anchorProfileId`
 * (a business_profiles id). Null when nothing good is close enough.
 */
export async function findNextBestOption(
  db: SupabaseClient,
  opts: { anchorProfileId: string; familyProfileId: string },
): Promise<NextBestOption | null> {
  return (await findNearbyOptions(db, { ...opts, limit: 1 }))[0] ?? null;
}

/**
 * The same lookup, ranked, up to `limit` providers. The provider-silent rescue
 * email (lib/family-comms/alternatives.ts) takes three; the post-inquiry offer
 * takes one. Empty when the anchor has no coordinates or nothing qualifies.
 */
export async function findNearbyOptions(
  db: SupabaseClient,
  opts: { anchorProfileId: string; familyProfileId?: string | null; limit: number },
): Promise<NextBestOption[]> {
  const { data: anchor } = await db
    .from("business_profiles")
    .select("id, display_name, source_provider_id, lat, lng, category, care_types")
    .eq("id", opts.anchorProfileId)
    .maybeSingle();
  if (!anchor) return [];

  let lat = typeof anchor.lat === "number" ? anchor.lat : null;
  let lng = typeof anchor.lng === "number" ? anchor.lng : null;
  let category: string | null = null;
  if (anchor.source_provider_id) {
    const { data: dir } = await db
      .from("olera-providers")
      .select("lat, lon, provider_category")
      .eq("provider_id", anchor.source_provider_id)
      .maybeSingle();
    if (dir) {
      lat = lat ?? (typeof dir.lat === "number" ? dir.lat : null);
      lng = lng ?? (typeof dir.lon === "number" ? dir.lon : null);
      category = primaryCategory(dir.provider_category);
    }
  }
  category =
    category ??
    primaryCategory(anchor.category) ??
    primaryCategory(((anchor.care_types as string[] | null) ?? [])[0]);
  if (lat === null || lng === null || !category) return [];

  // Providers this family has already asked — never offer one twice.
  const { data: asked } = opts.familyProfileId
    ? await db.from("connections").select("to_profile_id").eq("from_profile_id", opts.familyProfileId).eq("type", "inquiry")
    : { data: [] as { to_profile_id: string }[] };
  const askedProfileIds = Array.from(new Set((asked ?? []).map((c) => c.to_profile_id as string)));
  const askedDirectoryIds = new Set<string>();
  if (anchor.source_provider_id) askedDirectoryIds.add(anchor.source_provider_id);
  if (askedProfileIds.length) {
    const { data: askedRows } = await db
      .from("business_profiles")
      .select("source_provider_id")
      .in("id", askedProfileIds);
    for (const r of askedRows ?? []) if (r.source_provider_id) askedDirectoryIds.add(r.source_provider_id);
  }

  // Bounding box first, exact distance after. One degree of latitude is ~69 mi.
  const dLat = MAX_MILES / 69;
  const dLng = MAX_MILES / (69 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  const { data: rows } = await db
    .from("olera-providers")
    .select("provider_id, provider_name, slug, city, state, lat, lon, provider_category, google_rating, google_reviews_data")
    .eq("deleted", false)
    .gte("lat", lat - dLat)
    .lte("lat", lat + dLat)
    .gte("lon", lng - dLng)
    .lte("lon", lng + dLng)
    .ilike("provider_category", `%${category}%`)
    .limit(300);

  const want = category.toLowerCase();
  const candidates = ((rows ?? []) as DirectoryRow[])
    .filter((p) => p.slug && p.provider_name && typeof p.lat === "number" && typeof p.lon === "number")
    .filter((p) => !askedDirectoryIds.has(p.provider_id))
    .filter((p) => categories(p.provider_category).includes(want))
    .filter((p) => p.google_rating === null || p.google_rating >= MIN_RATING)
    .map((p) => ({ p, miles: haversineMi(lat!, lng!, p.lat!, p.lon!) }))
    .filter((c) => c.miles <= MAX_MILES)
    // The same place listed twice (a typo'd duplicate a few yards away) is not
    // a second option.
    .filter((c) => !(c.miles < 0.3 && nameStem(c.p.provider_name) === nameStem(anchor.display_name)));
  if (!candidates.length) return [];

  // Responsive = a real provider reply in the last 60 days, on any inquiry.
  const responsive = new Set<string>();
  const { data: profiles } = await db
    .from("business_profiles")
    .select("id, source_provider_id")
    .in("source_provider_id", candidates.map((c) => c.p.provider_id));
  const dirByProfile = new Map((profiles ?? []).map((r) => [r.id as string, r.source_provider_id as string]));
  if (dirByProfile.size) {
    const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
    const { data: conns } = await db
      .from("connections")
      .select("to_profile_id, metadata")
      .in("to_profile_id", Array.from(dirByProfile.keys()))
      .gte("created_at", since);
    for (const c of conns ?? []) {
      const thread = ((c.metadata as Record<string, unknown> | null)?.thread ?? []) as {
        from_profile_id?: string;
        text?: string;
        is_auto_reply?: boolean;
      }[];
      if (thread.some((m) => m.from_profile_id === c.to_profile_id && !m.is_auto_reply && m.text?.trim())) {
        const dir = dirByProfile.get(c.to_profile_id as string);
        if (dir) responsive.add(dir);
      }
    }
  }

  candidates.sort((a, b) => {
    const ra = responsive.has(a.p.provider_id) ? 1 : 0;
    const rb = responsive.has(b.p.provider_id) ? 1 : 0;
    if (ra !== rb) return rb - ra;
    // Rating in bands, not raw, so a 4.9 thirty miles off doesn't beat a 4.8
    // around the corner: "the closest good match", not the best-rated one.
    const band = (r: number | null) => (r === null ? 0 : r >= 4.5 ? 2 : 1);
    const ba = band(a.p.google_rating);
    const bb = band(b.p.google_rating);
    if (ba !== bb) return bb - ba;
    return a.miles - b.miles;
  });

  return candidates.slice(0, opts.limit).map((best) => ({
    providerId: best.p.provider_id,
    slug: best.p.slug!,
    name: best.p.provider_name!,
    city: best.p.city,
    state: best.p.state,
    distanceMi: Math.round(best.miles * 10) / 10,
    rating: best.p.google_rating,
    reviewCount: best.p.google_reviews_data?.review_count ?? null,
  }));
}

/**
 * The business_profiles id for a directory provider, creating the unclaimed
 * row if it does not exist yet. Same fields and race handling as the inquiry
 * route's directory branch (app/api/connections/request), which is what would
 * create it anyway the moment a family wrote to them. The rescue email needs
 * the id up front, because its one-tap "Introduce me" link carries it.
 */
export async function ensureProviderProfileId(db: SupabaseClient, directoryId: string): Promise<string | null> {
  const find = async () =>
    (await db.from("business_profiles").select("id").eq("source_provider_id", directoryId).limit(1).maybeSingle()).data?.id as
      | string
      | undefined;
  const existing = await find();
  if (existing) return existing;
  const { data: dir } = await db
    .from("olera-providers")
    .select("provider_name, slug, provider_category, main_category, city, state, phone, provider_logo, provider_images, lat, lon")
    .eq("provider_id", directoryId)
    .maybeSingle();
  if (!dir?.provider_name) return null;
  const careTypes = [dir.provider_category, dir.main_category].filter(
    (v, i, a): v is string => typeof v === "string" && !!v && a.indexOf(v) === i,
  );
  const { data: created, error } = await db
    .from("business_profiles")
    .insert({
      source_provider_id: directoryId,
      slug: dir.slug || directoryId,
      type: "organization",
      category: dir.provider_category,
      display_name: dir.provider_name,
      phone: dir.phone,
      city: dir.city,
      state: dir.state,
      lat: typeof dir.lat === "number" ? dir.lat : null,
      lng: typeof dir.lon === "number" ? dir.lon : null,
      image_url: dir.provider_logo || (dir.provider_images as string | null)?.split(" | ")?.[0] || null,
      care_types: careTypes,
      claim_state: "unclaimed",
      verification_state: "unverified",
      source: "seeded",
      is_active: true,
      metadata: {},
    })
    .select("id")
    .maybeSingle();
  if (created?.id) return created.id as string;
  if (error?.code === "23505") return (await find()) ?? null;
  if (error) console.error("[next-best-option] provider profile create failed", error);
  return null;
}

/**
 * The offer's funnel, recorded on the family's ORIGINAL inquiry under
 * metadata.next_best_option (6 Oct, TJ: "would be nice to know when families
 * tap that"). On the connection, not as an activity event, because a new
 * event_type needs a database CHECK migration and this needs none:
 *
 *   offered_at   the line was shown (the lookup found someone)
 *   opened_at    they tapped "Show me"
 *   sent_at      they sent their request to the offered provider
 *
 * Count with metadata->next_best_option->>offered_at / opened_at / sent_at.
 * First write wins for each stamp, so a reload never moves the clock. Never
 * throws: losing a stamp must not lose the family's request.
 */
export async function stampNextBestOption(
  db: SupabaseClient,
  connectionId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  try {
    const { data } = await db.from("connections").select("metadata").eq("id", connectionId).maybeSingle();
    if (!data) return;
    const metadata = (data.metadata as Record<string, unknown> | null) ?? {};
    const current = (metadata.next_best_option as Record<string, unknown> | undefined) ?? {};
    const merged: Record<string, unknown> = { ...patch, ...current };
    if (JSON.stringify(merged) === JSON.stringify(current)) return;
    await db.from("connections").update({ metadata: { ...metadata, next_best_option: merged } }).eq("id", connectionId);
  } catch (err) {
    console.error("[next-best-option] stamp failed", err);
  }
}

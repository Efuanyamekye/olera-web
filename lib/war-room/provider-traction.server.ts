import type { SupabaseClient } from "@supabase/supabase-js";
import { ACTOR_EVENT_TYPES, buildTractionLists, TRACTION_WINDOW_DAYS, tractionText, type TractionLists, type TractionRow } from "@/lib/war-room/provider-traction";

/**
 * Providers getting traction but not engaged, the database side. Pure SQL
 * reads, joined here because the tables key providers three ways:
 *   provider_page_view_stats.provider_id  = slug
 *   provider_questions.provider_id        = slug
 *   connections.to_profile_id             = business_profiles.id → source_provider_id (canonical id)
 *   provider_activity.provider_id         = slug for almost everything, canonical id for some claims
 * (checked against production on 7 Oct 2026: 9,699 of 9,843 view rows join
 * by slug and 8 by id; actor events join by slug 20 to 180 of each kind).
 *
 * "Claimed" means a business_profiles row with claim_state = 'claimed'.
 * The first version also required a claim_completed event, on the guess that
 * claims without one were bulk claims made inside Olera. Checked 7 Oct 2026:
 * 3 of 949 claimed profiles have an Olera-owned account, and the claims
 * without an event are real owners from before the event existed (Elliott
 * Place, Bowie Commons, Hoop Cares), who were being listed as "nobody owns
 * the page".
 */

const CHUNK = 200;
const SITE = () => process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";

async function pageAll<T>(fetch: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, pageSize = 1000, max = 20_000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += pageSize) {
    const { data, error } = await fetch(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return out;
}

function chunks<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function loadTractionRows(db: SupabaseClient, now: Date = new Date()): Promise<TractionRow[]> {
  const since = new Date(now.getTime() - TRACTION_WINDOW_DAYS * 86_400_000);
  const sinceIso = since.toISOString();
  const sinceDate = sinceIso.slice(0, 10);

  // Intent first: questions by slug, inquiries by profile → canonical id.
  const questionRows = await pageAll<{ provider_id: string }>((from, to) =>
    db.from("provider_questions").select("id, provider_id").gte("created_at", sinceIso).order("id").range(from, to));
  const questionsBySlug = new Map<string, number>();
  for (const q of questionRows) questionsBySlug.set(q.provider_id, (questionsBySlug.get(q.provider_id) ?? 0) + 1);

  const inquiryRows = await pageAll<{ to_profile_id: string }>((from, to) =>
    db.from("connections").select("id, to_profile_id").eq("type", "inquiry").gte("created_at", sinceIso).order("id").range(from, to));
  const inquiriesByProfile = new Map<string, number>();
  for (const c of inquiryRows) inquiriesByProfile.set(c.to_profile_id, (inquiriesByProfile.get(c.to_profile_id) ?? 0) + 1);
  const inquiriesById = new Map<string, number>();
  for (const ids of chunks([...inquiriesByProfile.keys()])) {
    const { data } = await db.from("business_profiles").select("id, source_provider_id").in("id", ids).not("source_provider_id", "is", null);
    for (const bp of (data ?? []) as Array<{ id: string; source_provider_id: string }>) {
      inquiriesById.set(bp.source_provider_id, (inquiriesById.get(bp.source_provider_id) ?? 0) + (inquiriesByProfile.get(bp.id) ?? 0));
    }
  }

  // The providers behind that intent, by slug and by id.
  type P = { provider_id: string; slug: string | null; provider_name: string | null; city: string | null; state: string | null; provider_category: string | null; email: string | null; deleted: boolean };
  const providers = new Map<string, P>();
  for (const slugs of chunks([...questionsBySlug.keys()])) {
    const { data } = await db.from("olera-providers").select("provider_id, slug, provider_name, city, state, provider_category, email, deleted").in("slug", slugs);
    for (const p of (data ?? []) as P[]) providers.set(p.provider_id, p);
  }
  for (const ids of chunks([...inquiriesById.keys()].filter((id) => !providers.has(id)))) {
    const { data } = await db.from("olera-providers").select("provider_id, slug, provider_name, city, state, provider_category, email, deleted").in("provider_id", ids);
    for (const p of (data ?? []) as P[]) providers.set(p.provider_id, p);
  }
  const live = [...providers.values()].filter((p) => !p.deleted && p.slug);
  const slugs = live.map((p) => p.slug as string);
  const ids = live.map((p) => p.provider_id);

  // Interest: views by slug, this window only.
  const viewsBySlug = new Map<string, number>();
  for (const part of chunks(slugs)) {
    const rows = await pageAll<{ provider_id: string; unique_view_count: number | null }>((from, to) =>
      db.from("provider_page_view_stats").select("provider_id, unique_view_count").gte("date", sinceDate).in("provider_id", part).order("provider_id").order("date").range(from, to));
    for (const r of rows) viewsBySlug.set(r.provider_id, (viewsBySlug.get(r.provider_id) ?? 0) + (r.unique_view_count ?? 0));
  }

  // Claims: a claimed profile, and the claim event that says a person did it.
  // The profile's own email counts too: a claimed provider's contact lives
  // there, and the directory row may be blank.
  const claimedIds = new Set<string>();
  const profileEmailIds = new Set<string>();
  for (const part of chunks(ids)) {
    const { data } = await db.from("business_profiles").select("source_provider_id, email").in("source_provider_id", part).eq("claim_state", "claimed");
    for (const bp of (data ?? []) as Array<{ source_provider_id: string; email: string | null }>) {
      claimedIds.add(bp.source_provider_id);
      if (bp.email && bp.email.trim()) profileEmailIds.add(bp.source_provider_id);
    }
  }

  // The provider acting, any time: newest event per key, keys are slug or id.
  const lastActorByKey = new Map<string, string>();
  for (const part of chunks([...slugs, ...ids])) {
    const rows = await pageAll<{ provider_id: string; event_type: string; created_at: string }>((from, to) =>
      db.from("provider_activity").select("provider_id, event_type, created_at").in("provider_id", part).in("event_type", [...ACTOR_EVENT_TYPES]).order("created_at", { ascending: false }).range(from, to), 1000, 10_000);
    for (const r of rows) {
      const prev = lastActorByKey.get(r.provider_id);
      if (!prev || prev < r.created_at) lastActorByKey.set(r.provider_id, r.created_at);
    }
  }

  return live.map((p) => {
    const slug = p.slug as string;
    const last = [lastActorByKey.get(slug), lastActorByKey.get(p.provider_id)].filter(Boolean).sort().pop() ?? null;
    return {
      provider_id: p.provider_id,
      slug,
      provider_name: p.provider_name,
      city: p.city,
      state: p.state,
      category: p.provider_category,
      views: viewsBySlug.get(slug) ?? 0,
      questions: questionsBySlug.get(slug) ?? 0,
      inquiries: inquiriesById.get(p.provider_id) ?? 0,
      claimed: claimedIds.has(p.provider_id),
      lastActorAt: last,
      hasEmail: Boolean(p.email && p.email.trim()) || profileEmailIds.has(p.provider_id),
    };
  });
}

export async function providerTractionLists(db: SupabaseClient, now: Date = new Date()): Promise<TractionLists> {
  return buildTractionLists(await loadTractionRows(db, now), now);
}

/** The Monday post for the "providers" thread, or null when nothing qualifies. */
export async function providerTractionText(db: SupabaseClient, now: Date = new Date()): Promise<string | null> {
  return tractionText(await providerTractionLists(db, now), now, SITE());
}

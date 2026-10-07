import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateProfileCompleteness, type ExtendedMetadata } from "@/lib/profile-completeness";
import type { Profile } from "@/lib/types";
import { ACTOR_EVENT_TYPES, TRACTION_WINDOW_DAYS } from "@/lib/war-room/provider-traction";
import {
  cardText,
  gapsFrom,
  gapsText,
  matchNamedProvider,
  providerLinksIn,
  rankGapRows,
  type GapRow,
  type ProviderCard,
} from "@/lib/war-room/provider-gaps";

/**
 * Information gaps on claimed, high-traffic pages, the database side, and the
 * "reply with a name" card for the providers thread.
 *
 * Keys, as provider-traction.server.ts found them on 7 Oct 2026: views and
 * questions by slug, inquiries by business profile → source_provider_id,
 * provider activity by slug or id. "Claimed" here is the profile's
 * claim_state: the owner controls the page, so the gaps are theirs to fill.
 */

const SITE = () => process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
const PROFILE_COLUMNS = "id, source_provider_id, display_name, category, address, city, state, image_url, care_types, description, metadata, email, claim_state";
const TOP_VIEWED = 600;
const CHUNK = 200;

function chunks<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function sinceDate(now: Date) {
  return new Date(now.getTime() - TRACTION_WINDOW_DAYS * 86_400_000);
}

type ProfileRow = Profile & { source_provider_id: string | null; metadata: ExtendedMetadata | null; email: string | null; claim_state: string | null };

function completeness(p: ProfileRow) {
  return calculateProfileCompleteness(p as Profile, (p.metadata ?? {}) as ExtendedMetadata);
}

/** Views by slug over the window, from the nightly rollup. */
async function viewsBySlug(db: SupabaseClient, now: Date): Promise<Map<string, number>> {
  const since = sinceDate(now).toISOString().slice(0, 10);
  const out = new Map<string, number>();
  for (let from = 0; from < 120_000; from += 1000) {
    const { data, error } = await db.from("provider_page_view_stats").select("provider_id, unique_view_count").gte("date", since).order("provider_id").range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as Array<{ provider_id: string; unique_view_count: number | null }>) out.set(r.provider_id, (out.get(r.provider_id) ?? 0) + (r.unique_view_count ?? 0));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** The ranked rows: most viewed slugs → their directory row → a claimed profile → its gaps. */
export async function loadGapRows(db: SupabaseClient, now: Date = new Date()): Promise<GapRow[]> {
  const views = await viewsBySlug(db, now);
  const top = [...views.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_VIEWED);
  const providers = new Map<string, { provider_id: string; slug: string; provider_name: string | null; city: string | null; state: string | null }>();
  for (const part of chunks(top.map(([slug]) => slug))) {
    const { data } = await db.from("olera-providers").select("provider_id, slug, provider_name, city, state, deleted").in("slug", part).eq("deleted", false);
    for (const p of (data ?? []) as Array<{ provider_id: string; slug: string; provider_name: string | null; city: string | null; state: string | null }>) providers.set(p.provider_id, p);
  }
  const rows: GapRow[] = [];
  for (const part of chunks([...providers.keys()])) {
    const { data } = await db.from("business_profiles").select(PROFILE_COLUMNS).in("source_provider_id", part).eq("claim_state", "claimed");
    for (const bp of (data ?? []) as unknown as ProfileRow[]) {
      const p = providers.get(String(bp.source_provider_id));
      if (!p) continue;
      const c = completeness(bp);
      rows.push({ slug: p.slug, provider_name: p.provider_name ?? bp.display_name ?? null, city: p.city, state: p.state, views: views.get(p.slug) ?? 0, overall: c.overall, gaps: gapsFrom(c.sections) });
    }
  }
  return rows;
}

/** The Monday post's second half, or null when no claimed page with traffic has a gap. */
export async function providerGapsText(db: SupabaseClient, now: Date = new Date()): Promise<string | null> {
  return gapsText(rankGapRows(await loadGapRows(db, now)), SITE(), TRACTION_WINDOW_DAYS);
}

// ---------------------------------------------------------------------------
// The card

export async function loadProviderCard(db: SupabaseClient, slug: string, now: Date = new Date()): Promise<ProviderCard | null> {
  const since = sinceDate(now);
  const { data: p } = await db.from("olera-providers").select("provider_id, slug, provider_name, city, state, email").eq("slug", slug).maybeSingle();
  if (!p) return null;
  const providerId = String(p.provider_id);
  const [viewRows, questionCount, profiles, activity] = await Promise.all([
    db.from("provider_page_view_stats").select("unique_view_count").eq("provider_id", slug).gte("date", since.toISOString().slice(0, 10)),
    db.from("provider_questions").select("id", { count: "exact", head: true }).eq("provider_id", slug).gte("created_at", since.toISOString()),
    db.from("business_profiles").select(PROFILE_COLUMNS).eq("source_provider_id", providerId),
    db.from("provider_activity").select("created_at").in("provider_id", [slug, providerId]).in("event_type", [...ACTOR_EVENT_TYPES]).order("created_at", { ascending: false }).limit(1),
  ]);
  const profileRows = (profiles.data ?? []) as unknown as ProfileRow[];
  const claimed = profileRows.find((r) => r.claim_state === "claimed") ?? null;
  let inquiries = 0;
  if (profileRows.length) {
    const { count } = await db.from("connections").select("id", { count: "exact", head: true }).eq("type", "inquiry").in("to_profile_id", profileRows.map((r) => r.id)).gte("created_at", since.toISOString());
    inquiries = count ?? 0;
  }
  const c = claimed ? completeness(claimed) : null;
  return {
    slug,
    name: String(p.provider_name ?? claimed?.display_name ?? slug),
    city: (p.city as string | null) ?? null,
    state: (p.state as string | null) ?? null,
    views: ((viewRows.data ?? []) as Array<{ unique_view_count: number | null }>).reduce((s, r) => s + (r.unique_view_count ?? 0), 0),
    questions: questionCount.count ?? 0,
    inquiries,
    claimed: Boolean(claimed),
    lastActorAt: ((activity.data ?? [])[0] as { created_at?: string } | undefined)?.created_at ?? null,
    email: (claimed?.email?.trim() || (p.email as string | null)?.trim() || null) ?? null,
    overall: c?.overall ?? null,
    gaps: c ? gapsFrom(c.sections) : [],
  };
}

/** A short note to the owner, in TJ's voice, from the card's facts only. Draft only. */
async function draftOwnerNote(card: ProviderCard): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const facts = [
    `Provider: ${card.name}${card.city ? `, ${card.city}${card.state ? `, ${card.state}` : ""}` : ""}`,
    `Families in the last 28 days: ${card.views} page views, ${card.questions} questions, ${card.inquiries} inquiries.`,
    card.claimed ? "They claimed their Olera page." : "They have not claimed their Olera page.",
    card.gaps.length ? `Their page is missing: ${card.gaps.map((g) => g.words).join("; ")}.` : "Their page is complete.",
  ].join("\n");
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const reply = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 400,
      system: [
        "Draft a short email from TJ Falohun, Founder of Olera, to the owner of a senior-care provider. Plain text, no subject line, 70 to 120 words.",
        "Open with what families did on their page (the numbers given), then the one or two most useful things to add, and why families look for them, then a link placeholder [their dashboard link]. If unclaimed, the ask is to claim the page instead.",
        "Use only the facts given. Never invent numbers, family names, or outcomes. No 'I hope this finds you well', no 'just checking in', no exclamation marks, no em dashes. Do not apologize.",
        "Sign: TJ Falohun, Founder, Olera",
      ].join("\n"),
      messages: [{ role: "user", content: facts }],
    }, { timeout: 20_000, maxRetries: 0 });
    return reply.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text.trim() || null;
  } catch {
    return null;
  }
}

/**
 * The founder replied in the providers thread. If his message names a
 * provider the thread has named, answer with the card and a drafted note.
 * Null when it names none of them, so the message goes on to tuning or to
 * the question engine.
 */
export async function providerCardReply(
  db: SupabaseClient,
  args: { threadTs: string; text: string },
  now: Date = new Date(),
): Promise<string | null> {
  const { data } = await db.from("cortex_posts").select("text").or(`slack_ts.eq.${args.threadTs},thread_ts.eq.${args.threadTs}`).limit(50);
  const named = ((data ?? []) as Array<{ text: string }>).flatMap((post) => providerLinksIn(post.text));
  const match = matchNamedProvider(args.text, named);
  if (!match) return null;
  const card = await loadProviderCard(db, match.slug, now);
  if (!card) return `I named ${match.name} earlier but cannot find the listing now; it may have been archived.`;
  const draft = card.email ? await draftOwnerNote(card) : null;
  const parts = [cardText(card, SITE(), TRACTION_WINDOW_DAYS, now)];
  if (draft) parts.push(`Draft to the owner (not sent; copy it or tell me what to change):\n> ${draft.replace(/\n+/g, "\n> ")}`);
  return parts.join("\n\n");
}

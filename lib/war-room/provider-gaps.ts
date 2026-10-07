import type { SectionScore } from "@/lib/profile-completeness";

/**
 * Information gaps on claimed, high-traffic provider pages, the pure part.
 * The database side is provider-gaps.server.ts; scripts/check-provider-gaps.ts
 * checks this file. Slice 3 of docs/cortex/ACTIVITIES.md.
 *
 * Families open these pages; the owner has an account; the page is missing
 * what the completeness score already knows a family looks for (photos,
 * pricing, an About, services, screening, payments). Each gap is something
 * the owner can fix in a few minutes, so it is the honest reason to write.
 * The score is lib/profile-completeness.ts, unchanged.
 */

/** What a missing section is, in the words an owner would use. */
const GAP_WORDS: Record<string, string> = {
  overview: "profile basics (photo, category or address)",
  pricing: "pricing",
  screening: "how staff are screened",
  services: "the care services offered",
  gallery: "photos (three or more)",
  about: "an About section",
  payment: "accepted payments and insurance",
};

export type Gap = { id: string; words: string; weight: number; percent: number };

/** Sections under 100%, heaviest first: the order to ask for them in. */
export function gapsFrom(sections: SectionScore[]): Gap[] {
  return sections
    .filter((s) => s.percent < 100)
    .sort((a, b) => b.weight - a.weight || a.percent - b.percent)
    .map((s) => ({ id: s.id, words: GAP_WORDS[s.id] ?? s.label.toLowerCase(), weight: s.weight, percent: s.percent }));
}

export type GapRow = {
  slug: string;
  provider_name: string | null;
  city: string | null;
  state: string | null;
  views: number;
  overall: number;
  gaps: Gap[];
};

/** Worth naming: real traffic and something to fix. Most viewed first. */
export function rankGapRows(rows: GapRow[], minViews = 5, limit = 10): { shown: GapRow[]; total: number } {
  const eligible = rows.filter((r) => r.views >= minViews && r.gaps.length > 0).sort((a, b) => b.views - a.views || a.overall - b.overall);
  return { shown: eligible.slice(0, limit), total: eligible.length };
}

const n = (v: number) => v.toLocaleString("en-US");

export function gapsText(ranked: { shown: GapRow[]; total: number }, siteUrl: string, windowDays: number): string | null {
  if (!ranked.shown.length) return null;
  const lines = [`*Claimed pages families open that are missing things, last ${windowDays} days* (${n(ranked.total)} in all). Each gap is a few minutes for the owner.`];
  for (const r of ranked.shown) {
    const where = r.city ? ` (${r.city}${r.state ? `, ${r.state}` : ""})` : "";
    const missing = r.gaps.slice(0, 3).map((g) => g.words).join(", ");
    lines.push(`• <${siteUrl}/provider/${r.slug}|${r.provider_name ?? r.slug}>${where}: ${n(r.views)} views, ${r.overall}% complete; missing ${missing}${r.gaps.length > 3 ? ` and ${r.gaps.length - 3} more` : ""}`);
  }
  lines.push("Reply here with a name and I will pull up what I know and draft a note to the owner; nothing is sent without a person.");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// "Reply with a name": the providers this thread has named, and which one he means.

export type NamedProvider = { slug: string; name: string };

/** Every `<…/provider/<slug>|Name>` link in Cortex's posts. */
export function providerLinksIn(text: string): NamedProvider[] {
  const out: NamedProvider[] = [];
  const re = /<https?:\/\/[^|>]*\/provider\/([^|>/?#]+)\|([^>]+)>/g;
  for (const m of text.matchAll(re)) out.push({ slug: m[1], name: m[2].trim() });
  return out;
}

export function normalizeName(s: string): string {
  return s.toLowerCase().replace(/&/g, " and ").replace(/['’`.]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Which named provider the founder means. A match is the provider's whole
 * name inside his message, or his message (three characters or more) inside
 * the name. The longest name wins, so "Bowie Commons" beats "Bowie".
 */
export function matchNamedProvider(message: string, candidates: NamedProvider[]): NamedProvider | null {
  const said = normalizeName(message);
  if (said.length < 3) return null;
  const seen = new Map<string, NamedProvider>();
  for (const c of candidates) if (!seen.has(c.slug)) seen.set(c.slug, c);
  const hits = [...seen.values()].filter((c) => {
    const name = normalizeName(c.name);
    return name.length >= 3 && (said.includes(name) || name.includes(said));
  });
  hits.sort((a, b) => b.name.length - a.name.length);
  return hits[0] ?? null;
}

export type ProviderCard = {
  slug: string;
  name: string;
  city: string | null;
  state: string | null;
  views: number;
  questions: number;
  inquiries: number;
  claimed: boolean;
  lastActorAt: string | null;
  email: string | null;
  overall: number | null;
  gaps: Gap[];
};

/** The card, before the draft. */
export function cardText(c: ProviderCard, siteUrl: string, windowDays: number, now: Date): string {
  const where = c.city ? ` (${c.city}${c.state ? `, ${c.state}` : ""})` : "";
  const acted = c.lastActorAt ? `last acted ${n(Math.floor((now.getTime() - Date.parse(c.lastActorAt)) / 86_400_000))} days ago` : "never acted";
  const lines = [
    `*<${siteUrl}/provider/${c.slug}|${c.name}>*${where}`,
    `Last ${windowDays} days: ${n(c.views)} views, ${n(c.questions)} question${c.questions === 1 ? "" : "s"}, ${n(c.inquiries)} inquir${c.inquiries === 1 ? "y" : "ies"}.`,
    c.claimed ? `Claimed; ${acted}.` : "Not claimed by the provider.",
    c.overall === null ? "" : c.gaps.length ? `Page ${c.overall}% complete; missing ${c.gaps.map((g) => g.words).join(", ")}.` : "Page 100% complete.",
    c.email ? `Email on file: ${c.email}` : "No email on file; this one is a call.",
  ];
  return lines.filter(Boolean).join("\n");
}

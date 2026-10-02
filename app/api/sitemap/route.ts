import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  CATEGORY_CONFIGS,
  stateAbbrevToSlug,
  cityToSlug,
} from "@/lib/power-pages";
import { allStates } from "@/data/waiver-library";
import { pipelineDrafts } from "@/data/pipeline-drafts";
import { allEpisodes } from "@/lib/aging-in-america-data";
import { shouldIndexBenefitsProgram } from "@/lib/benefits/program-content-quality";
import { listBrands, BRANDS_BASE_PATH } from "@/lib/brands";
import { withoutDuplicates } from "@/lib/benefits/program-duplicates";

export const dynamic = "force-dynamic";

const SITE_URL = "https://olera.care";

// State slug <-> 2-letter postal abbreviation. Mirrors STATE_ABBREVS in
// lib/program-data.ts (not exported there). Static; changes once a decade.
const SLUG_TO_ABBREV: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO",
  montana: "MT", nebraska: "NE", nevada: "NV", "new-hampshire": "NH", "new-jersey": "NJ",
  "new-mexico": "NM", "new-york": "NY", "north-carolina": "NC", "north-dakota": "ND",
  ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode-island": "RI",
  "south-carolina": "SC", "south-dakota": "SD", tennessee: "TN", texas: "TX",
  utah: "UT", vermont: "VT", virginia: "VA", washington: "WA", "west-virginia": "WV",
  wisconsin: "WI", wyoming: "WY", "district-of-columbia": "DC",
};
const ABBREV_TO_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(SLUG_TO_ABBREV).map(([slug, abbrev]) => [abbrev, slug])
);

function getSupabaseClient() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return null;
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

function xmlEntry(url: string, priority: number, changefreq: string, lastmod?: string | null) {
  let day: string | null = null;
  if (lastmod) {
    const d = new Date(lastmod);
    if (!isNaN(d.getTime())) day = d.toISOString().split("T")[0];
  }
  return (
    `  <url>\n    <loc>${url}</loc>\n` +
    (day ? `    <lastmod>${day}</lastmod>\n` : "") +
    `    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const shardParam = searchParams.get("shard");
  const supabase = getSupabaseClient();

  // No shard param → return sitemap index pointing to all shards
  if (shardParam === null) {
    let providerShards = 4; // default
    if (supabase) {
      try {
        const { count } = await supabase
          .from("olera-providers")
          .select("provider_id", { count: "exact", head: true })
          .or("deleted.is.null,deleted.eq.false");
        if (count) {
          providerShards = Math.ceil(count / 10_000);
        }
      } catch (err) {
        console.error("[api/sitemap] count error:", err);
      }
    }

    const shardEntries: string[] = [];
    for (let i = 0; i <= providerShards; i++) {
      shardEntries.push(
        `  <sitemap>\n    <loc>${SITE_URL}/api/sitemap?shard=${i}</loc>\n    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>\n  </sitemap>`
      );
    }

    const indexXml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${shardEntries.join("\n")}\n</sitemapindex>`;

    return new NextResponse(indexXml, {
      headers: {
        "Content-Type": "application/xml",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  }

  const shard = parseInt(shardParam, 10);
  const entries: string[] = [];

  try {
    if (shard === 0) {
      // Static pages
      const staticPages = [
        { path: "/", priority: 1.0, freq: "daily" },
        { path: "/browse", priority: 0.9, freq: "daily" },
        { path: "/browse/providers", priority: 0.8, freq: "daily" },
        { path: "/browse/caregivers", priority: 0.8, freq: "daily" },
        { path: "/browse/families", priority: 0.8, freq: "daily" },
        { path: "/for-providers", priority: 0.8, freq: "weekly" },
        { path: "/benefits", priority: 0.7, freq: "weekly" },
        { path: "/benefits/finder", priority: 0.7, freq: "weekly" },
        { path: "/community", priority: 0.6, freq: "weekly" },
        { path: "/caregiver-support", priority: 0.6, freq: "weekly" },
        { path: "/research-and-press", priority: 0.6, freq: "weekly" },
        { path: "/team", priority: 0.7, freq: "monthly" },
        { path: "/privacy", priority: 0.3, freq: "yearly" },
        { path: "/terms", priority: 0.3, freq: "yearly" },
        { path: "/senior-benefits", priority: 0.6, freq: "monthly" },
        { path: "/medjobs", priority: 0.8, freq: "weekly" },
        { path: "/medjobs/candidates", priority: 0.7, freq: "daily" },
        { path: "/medjobs/apply", priority: 0.7, freq: "monthly" },
        { path: "/aging-in-america", priority: 0.7, freq: "weekly" },
      ];
      for (const p of staticPages) {
        entries.push(xmlEntry(`${SITE_URL}${p.path}`, p.priority, p.freq));
      }

      // Aging in America episode pages
      for (const ep of allEpisodes) {
        entries.push(xmlEntry(`${SITE_URL}/aging-in-america/${ep.slug}`, 0.6, "monthly"));
      }

      // Brand hub pages (one per franchise / multi-location operator)
      try {
        const brands = await listBrands();
        if (brands.length > 0) {
          entries.push(xmlEntry(`${SITE_URL}${BRANDS_BASE_PATH}`, 0.7, "weekly"));
          for (const brand of brands) {
            entries.push(xmlEntry(`${SITE_URL}${BRANDS_BASE_PATH}/${brand.slug}`, 0.7, "weekly"));
          }
        }
      } catch (err) {
        console.error("[sitemap] brands error:", err);
      }

      // Waiver-library state URLs (state listing page)
      for (const state of allStates) {
        entries.push(xmlEntry(`${SITE_URL}/benefits/${state.id}`, 0.5, "monthly"));
      }

      // Program URLs come from pipeline-drafts (the source of truth for
      // /benefits/[slug]/[program] rendering). Covers both waiver-library
      // states and pipeline-only states (e.g. DC).
      for (const [abbrev, drafts] of Object.entries(pipelineDrafts)) {
        if (drafts?.isRegion === true) continue;
        const slug = ABBREV_TO_SLUG[abbrev];
        if (!slug) {
          console.warn(`[api/sitemap] pipeline abbrev "${abbrev}" has no slug mapping; skipping`);
          continue;
        }
        // Emit state URL for pipeline-only states (waiver-library states already emitted above)
        if (!allStates.some((s) => s.id === slug)) {
          entries.push(xmlEntry(`${SITE_URL}/benefits/${slug}`, 0.5, "monthly"));
        }
        for (const draft of withoutDuplicates(abbrev, drafts.programs ?? [])) {
          if (!shouldIndexBenefitsProgram(draft)) continue;
          entries.push(xmlEntry(`${SITE_URL}/benefits/${slug}/${draft.id}`, 0.4, "monthly"));
        }
      }

      // Articles
      if (supabase) {
        const { data: articles } = await supabase
          .from("content_articles")
          .select("slug, section, published_at")
          .eq("status", "published")
          .not("published_at", "is", null);
        if (articles) {
          for (const a of articles) {
            entries.push(xmlEntry(`${SITE_URL}/${a.section || "caregiver-support"}/${a.slug}`, 0.6, "monthly"));
          }
        }
      }

      // Power pages
      if (supabase) {
        for (const cat of CATEGORY_CONFIGS) {
          entries.push(xmlEntry(`${SITE_URL}/${cat.slug}`, 0.8, "weekly"));
          const stateSet = new Set<string>();
          const citySet = new Set<string>();
          const PAGE_SIZE = 10_000;
          let offset = 0;
          let hasMore = true;
          while (hasMore) {
            const { data: geoCombos } = await supabase
              .from("olera-providers")
              .select("state, city")
              .eq("provider_category", cat.dbValue)
              .or("deleted.is.null,deleted.eq.false")
              .not("state", "is", null)
              .not("city", "is", null)
              .range(offset, offset + PAGE_SIZE - 1);
            if (!geoCombos || geoCombos.length === 0) break;
            for (const row of geoCombos) {
              stateSet.add(row.state as string);
              citySet.add(`${row.state}::${row.city}`);
            }
            hasMore = geoCombos.length === PAGE_SIZE;
            offset += PAGE_SIZE;
          }
          for (const abbr of stateSet) {
            entries.push(xmlEntry(`${SITE_URL}/${cat.slug}/${stateAbbrevToSlug(abbr)}`, 0.75, "weekly"));
          }
          for (const key of citySet) {
            const [abbr, city] = key.split("::");
            entries.push(xmlEntry(`${SITE_URL}/${cat.slug}/${stateAbbrevToSlug(abbr)}/${cityToSlug(city)}`, 0.7, "weekly"));
          }
        }
      }
    } else {
      // Provider shards — paginate in batches of 1000 (Supabase default row limit)
      if (supabase) {
        const SHARD_SIZE = 10_000;
        const PAGE_SIZE = 1_000;
        const shardStart = (shard - 1) * SHARD_SIZE;
        // Honest <lastmod>: when the description was last (re)written
        // (migration 082's description_updated_at), falling back to
        // cleansed_at / created_at. Probe once and degrade to the minimal
        // select if the freshness columns aren't applied on this environment.
        let providerSelect = "provider_id, slug, description_updated_at, cleansed_at, created_at";
        {
          const probe = await supabase.from("olera-providers").select(providerSelect).limit(1);
          if (probe.error) providerSelect = "provider_id, slug";
        }
        const lastmodOf = (p: Record<string, any>) =>
          (p.description_updated_at || p.cleansed_at || p.created_at) as string | undefined;
        let fetched = 0;
        while (fetched < SHARD_SIZE) {
          const from = shardStart + fetched;
          const to = from + PAGE_SIZE - 1;
          const { data } = await supabase
            .from("olera-providers")
            .select(providerSelect)
            .or("deleted.is.null,deleted.eq.false")
            .range(from, to);
          const providers = data as Array<Record<string, any>> | null;
          if (!providers || providers.length === 0) break;
          for (const p of providers) {
            entries.push(xmlEntry(`${SITE_URL}/provider/${p.slug || p.provider_id}`, 0.7, "weekly", lastmodOf(p)));
          }
          if (providers.length < PAGE_SIZE) break;
          fetched += providers.length;
        }
      }
    }
  } catch (err) {
    console.error("[api/sitemap] error:", err);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

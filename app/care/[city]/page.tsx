import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getServiceClient } from "@/lib/admin";
import { getCityConfig, isStaffedNow } from "@/lib/city-ads/config";
import { parseProviderImages } from "@/lib/types/provider";
import { MetaPixel } from "@/components/analytics/MetaPixel";
import CityLandingClient, { type CityProviderCard } from "./CityLandingClient";

/**
 * /care/{city} — the landing page for Olera-owned city ad campaigns.
 *
 * One job: capture a family's care request and hand it to a local provider who
 * calls back. No nav, no directory links, no phone number (nobody is staffed to
 * answer one yet). Message-matched to the ad down to the city name. noindex on
 * purpose: this is a paid landing page, not a search page.
 */

export const dynamic = "force-dynamic";

type Params = { city: string };
type Search = Record<string, string | string[] | undefined>;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { city } = await params;
  const cfg = getCityConfig(city);
  if (!cfg) return { title: "Senior care near you | Olera" };
  return {
    title: `Senior care in ${cfg.city} | Olera`,
    description:
      cfg.routingMode === "concierge"
        ? `Tell us what you need and someone from Olera will call you back today. Free for families.`
        : `Tell us what you need. A licensed local provider in ${cfg.city} will call you back. Free for families.`,
    robots: { index: false, follow: false },
  };
}

function first(v: string | string[] | undefined): string | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function CityCarePage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { city } = await params;
  const cfg = getCityConfig(city);
  if (!cfg) notFound();
  const sp = await searchParams;

  // Local provider cards: the city pool, joined to the account row. Only
  // things we can stand behind: name, town, care type, and whether the account
  // is verified on Olera. No ratings until they are pulled at source.
  let providers: CityProviderCard[] = [];
  try {
    const db = getServiceClient();
    // Only providers who have said YES to taking requests. A disabled row is
    // a prospect, and a test row is never a public card.
    const { data: pool } = await db
      .from("city_pool")
      .select("provider_id, position, care_types")
      .eq("slug", cfg.slug)
      .eq("enabled", true)
      .eq("is_test", false)
      .order("position", { ascending: true });
    const ids = (pool ?? []).map((p) => p.provider_id as string);
    if (ids.length > 0) {
      const { data: rows } = await db
        .from("business_profiles")
        .select("id, display_name, city, verification_state, image_url, slug")
        .in("id", ids);
      const byId = new Map((rows ?? []).map((r) => [r.id as string, r]));
      // Photos: the account's own image first, then the directory listing's
      // photos or logo, then initials on the client.
      const slugs = (rows ?? []).map((r) => r.slug as string).filter(Boolean);
      const { data: dir } = slugs.length
        ? await db.from("olera-providers").select("slug, provider_images, provider_logo").in("slug", slugs)
        : { data: [] as Record<string, unknown>[] };
      const photoBySlug = new Map<string, string | null>();
      for (const d of dir ?? []) {
        const imgs = parseProviderImages((d.provider_images as string | null) ?? null);
        photoBySlug.set(d.slug as string, (d.provider_logo as string | null) || imgs[0] || null);
      }
      providers = (pool ?? [])
        .map((p) => {
          const r = byId.get(p.provider_id as string);
          if (!r) return null;
          const types = (p.care_types as string[]) ?? [];
          return {
            name: (r.display_name as string) ?? "Local provider",
            town: (r.city as string) ?? cfg.city,
            careLabel: types.includes("assisted_living") ? "Assisted living" : "In-home care",
            verified: ["verified", "not_required"].includes(String(r.verification_state)),
            photo: (r.image_url as string | null) || photoBySlug.get(r.slug as string) || null,
          } as CityProviderCard;
        })
        .filter((x): x is CityProviderCard => x !== null)
        .slice(0, 4);
    }
  } catch (err) {
    console.error("[care/city] provider cards failed", err);
  }

  return (
    <>
      {/* Only this page. See the scope note in lib/city-ads/meta.ts. */}
      <MetaPixel />
      <CityLandingClient
        cfg={cfg}
        providers={providers}
        staffedNow={isStaffedNow(cfg.timeZone)}
        utm={{
          source: first(sp.utm_source),
          medium: first(sp.utm_medium),
          campaign: first(sp.utm_campaign),
          gclid: first(sp.gclid),
          fbclid: first(sp.fbclid),
        }}
      />
    </>
  );
}

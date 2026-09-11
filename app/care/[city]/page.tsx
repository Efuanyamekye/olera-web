import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getServiceClient } from "@/lib/admin";
import { getCityConfig, isStaffedNow } from "@/lib/city-ads/config";
import {
  CITY_ARM_COOKIE,
  isCityLandingArm,
  resolveCityLandingArm,
} from "@/lib/city-ads/landing-variant";
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

  // Which landing-page arm this visitor sees. Resolved on the server so the
  // first paint is already the right one — swapping after hydration would show
  // every visitor the control for a frame, which is exactly the moment the
  // page is being judged. The page is force-dynamic, so this is per request.
  const { arm, assigned } = resolveCityLandingArm({
    override: first(sp.v),
    cookie: (await cookies()).get(CITY_ARM_COOKIE)?.value ?? null,
  });
  // A ?v= preview is a review tool, not a visitor. It must neither persist a
  // cookie (which would pin a reviewer to one arm for 30 days) nor write
  // events (which would put our own QA into the experiment's numerator).
  // The first version of this shipped with the flag resolved and then
  // discarded, so every preview load polluted the data it was previewing.
  const previewing = !assigned && isCityLandingArm(first(sp.v));

  // Local provider cards: the city pool, joined to the account row. Only
  // things we can stand behind: name, town, care type, and whether the account
  // is verified on Olera. No ratings until they are pulled at source.
  let providers: CityProviderCard[] = [];
  try {
    const db = getServiceClient();
    // Which pool rows may appear as cards.
    //
    // `city_pool.enabled` is the ON CALL flag: it decides whether a provider
    // gets TEXTED when a lead lands (see offers.server.ts, and /admin/city-ads
    // renders it as "N on call"). Under concierge routing it is deliberately
    // false for everyone, because Olera calls the family and no provider is
    // contacted at all. Gating the cards on it therefore shipped both city
    // landing pages with no provider proof on them for the whole first flight.
    // Display now has its own rule:
    //
    //   concierge      -> any claimed, active account in this city's pool.
    //                     Nobody is texted either way, and the card only
    //                     claims the provider is local and on Olera.
    //   provider chain -> still `enabled`, because there the page promises the
    //                     request goes to one of them, and a provider who is
    //                     not on call cannot receive it.
    //
    // A test row is never a public card under either rule.
    const conciergeRouting = cfg.routingMode === "concierge";
    let poolQuery = db
      .from("city_pool")
      .select("provider_id, position, care_types")
      .eq("slug", cfg.slug)
      .eq("is_test", false)
      .order("position", { ascending: true });
    if (!conciergeRouting) poolQuery = poolQuery.eq("enabled", true);
    const { data: pool, error: poolError } = await poolQuery;
    // This page swallowed its errors, which is how a page rendering no cards
    // stayed indistinguishable from a page that simply converted badly for
    // four days. Say which failure it was.
    if (poolError) console.error("[care/city] pool query failed", cfg.slug, poolError);
    const ids = (pool ?? []).map((p) => p.provider_id as string);
    if (ids.length > 0) {
      // "Has said yes" is the account being claimed, not the on-call flag.
      // An unclaimed row is a prospect we scraped and must never be shown as
      // social proof; an inactive one has gone away.
      const { data: rows, error: rowsError } = await db
        .from("business_profiles")
        .select("id, display_name, city, verification_state, image_url, slug")
        .in("id", ids)
        .eq("claim_state", "claimed")
        .eq("is_active", true);
      if (rowsError) console.error("[care/city] business_profiles query failed", cfg.slug, rowsError);
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
            // The full set this provider covers in this pool. The header line
            // only has room for one label; providers_first expands to show the
            // rest, which is the payoff that arm promises before it asks.
            careTypes: types,
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
        arm={arm}
        previewing={previewing}
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

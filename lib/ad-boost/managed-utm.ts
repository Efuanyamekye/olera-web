/**
 * Managed-ads attribution that survives multi-step lead flows.
 *
 * A paid Ad Boost link lands a family on
 * `/provider/<slug>?utm_source=olera_managed&utm_campaign=<tag>`. The natural
 * conversion is the provider-page inquiry CTA (`lead_received`) — but that fires
 * deep inside a multi-step flow (enrichment, sticky CTAs, compare/guide sheets)
 * by which point the URL query string is long gone. The Franchil pilot's first
 * real lead lost its UTM exactly this way.
 *
 * Fix: capture the managed-ads UTM ONCE at provider-page load into a short-lived
 * cookie (`captureManagedUtm`, client) and read it back server-side in every
 * lead-capture route (`readManagedUtmFromRequest`). Cookies ride along on the
 * same-origin fetches the lead CTAs already make, so no client caller needs to
 * thread anything — one capture point covers all ~10 inquiry paths.
 *
 * Scope: only `utm_source=olera_managed` is ever persisted (we never store
 * organic/other campaign UTM here). 6h TTL bounds cross-provider bleed if the
 * family later browses other providers in the same session.
 *
 * Pure helpers + window-guarded client fn + header-parsing server fn — no
 * server-only/client-only imports — so this module is safe to import from both
 * server routes and client components.
 */

export const MANAGED_UTM_COOKIE = "olera_mutm";
export const MANAGED_UTM_SOURCE = "olera_managed";
/** 6 hours — long enough for one research session, short enough to bound bleed. */
export const MANAGED_UTM_MAX_AGE_S = 6 * 60 * 60;

export interface ManagedUtm {
  utmSource?: string;
  utmCampaign?: string;
}

/** Serialize attribution to the compact cookie value (URL-encoded JSON). */
export function serializeManagedUtm(source: string, campaign: string): string {
  return encodeURIComponent(JSON.stringify({ s: source, c: campaign }));
}

/** Parse a raw `Cookie:` header and return managed-ads UTM if present + valid. */
export function parseManagedUtmCookieHeader(cookieHeader: string | null): ManagedUtm {
  if (!cookieHeader) return {};
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${MANAGED_UTM_COOKIE}=([^;]+)`),
  );
  if (!match) return {};
  try {
    const parsed = JSON.parse(decodeURIComponent(match[1])) as { s?: string; c?: string };
    if (parsed.s === MANAGED_UTM_SOURCE && parsed.c) {
      return { utmSource: parsed.s, utmCampaign: parsed.c };
    }
  } catch {
    // malformed cookie — treat as no attribution
  }
  return {};
}

/**
 * Client-only: if the current URL is a managed-ads landing, persist the
 * attribution to the cookie. No-op on the server, for non-managed traffic, or
 * if a managed cookie is already set (first-touch wins within the session).
 */
export function captureManagedUtm(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const sp = new URLSearchParams(window.location.search);
  const source = sp.get("utm_source");
  const campaign = sp.get("utm_campaign");
  if (source !== MANAGED_UTM_SOURCE || !campaign) return;
  // First-touch: don't overwrite an existing managed attribution this session.
  if (parseManagedUtmCookieHeader(document.cookie).utmCampaign) return;
  document.cookie = `${MANAGED_UTM_COOKIE}=${serializeManagedUtm(source, campaign)}; path=/; max-age=${MANAGED_UTM_MAX_AGE_S}; SameSite=Lax`;
}

/** Server: read managed-ads attribution from a request's Cookie header. */
export function readManagedUtmFromRequest(req: { headers: { get(name: string): string | null } }): ManagedUtm {
  return parseManagedUtmCookieHeader(req.headers.get("cookie"));
}

/** Build the metadata fragment to spread onto a `lead_received` event so an
 *  ad-driven inquiry is attributed to its campaign. Empty when no managed UTM. */
export function managedUtmMetadata(utm: ManagedUtm): Record<string, string> {
  const out: Record<string, string> = {};
  if (utm.utmSource) out.utm_source = utm.utmSource;
  if (utm.utmCampaign) out.utm_campaign = utm.utmCampaign;
  return out;
}

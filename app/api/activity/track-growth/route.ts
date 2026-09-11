import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isBotRequest, incrementBotReject } from "@/lib/analytics/bot-filter";
import { classifyOrganicPage, normalizeOrganicPagePath } from "@/lib/analytics/content-pages";
import { classifyReferrer, sanitizeReferrer } from "@/lib/analytics/referrer";
import { classifyUserAgent } from "@/lib/analytics/user-agent";
import { isCityLandingArm } from "@/lib/city-ads/landing-variant";

const CLIENT_EVENTS = new Set([
  "page_landed",
  "cta_visible",
  "cta_engaged",
  "lead_started",
  "contact_intent",
  // /care/{city} landing A/B test. Keep in step with GrowthClientEvent in
  // lib/analytics/growth-attribution.ts and the CHECK in migration 223.
  "question_viewed",
  "provider_expanded",
]);

/**
 * Page categories a client may declare for itself, used only when the organic
 * classifier returns null. Keeps paid landing pages out of the organic
 * reporting path while still giving them a funnel. Must stay in sync with the
 * page_category CHECK on growth_attribution_events (migration 216).
 */
const NON_ORGANIC_CATEGORIES = new Set(["city_landing"]);

function getServiceDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key) : null;
}

function trafficChannel(metadata: Record<string, unknown>) {
  const medium = typeof metadata.utm_medium === "string" ? metadata.utm_medium.toLowerCase() : "";
  const source = typeof metadata.utm_source === "string" ? metadata.utm_source.toLowerCase() : "";

  const referrerClass = classifyReferrer(typeof metadata.referrer === "string" ? metadata.referrer : null);

  // Our own traffic is never a paid channel, even when it lands on a campaign
  // URL. QA sweeps and admin click-throughs open the tagged link constantly,
  // and counting them as paid inflates every channel rate we report.
  if (referrerClass === "olera_internal") return "olera_internal";

  if (metadata.gclid === true || ["cpc", "ppc", "paid", "paid_search"].includes(medium)) return "paid_search";

  // Paid SOCIAL was missing, so every managed Nextdoor arrival fell through to
  // the referrer check and was filed as "direct" or "referral" -- 140 landings
  // in the Aug 2026 flights alone. That silently hid the paid-social channel
  // and polluted direct/referral, which is exactly the comparison the
  // Nextdoor-vs-Meta budget decision rests on.
  if (["paid_social", "social_paid", "cpm", "display", "paid-social"].includes(medium)) return "paid_social";

  // Belt and braces: anything we tagged as managed media is paid by definition,
  // whatever the medium says. Two live flights shipped with no utm_medium at
  // all, and without this they would classify off their referrer.
  if (source === "olera_managed") return medium.includes("social") ? "paid_social" : "paid_search";

  if (referrerClass === "search") return "organic_search";
  if (referrerClass === "social") return "social";
  if (referrerClass === "ai_chat") return "ai_chat";
  // olera_internal is handled above, before the paid rules, so our own QA
  // traffic on a campaign URL can never be counted as paid.
  if (referrerClass === "direct") return "direct";
  return "referral";
}

function shortText(value: unknown, max = 160) {
  return typeof value === "string" ? value.slice(0, max) : null;
}

export async function POST(request: NextRequest) {
  try {
    const userAgent = request.headers.get("user-agent");
    if (isBotRequest(userAgent)) {
      incrementBotReject();
      return new NextResponse(null, { status: 204 });
    }
    const body = await request.json() as Record<string, unknown>;
    const eventType = typeof body.event_type === "string" ? body.event_type : "";
    const anonymousId = typeof body.anonymous_id === "string" ? body.anonymous_id : "";
    const visitId = typeof body.visit_id === "string" ? body.visit_id : "";
    const pagePath = normalizeOrganicPagePath(typeof body.page_path === "string" ? body.page_path : "");
    // Organic pages are classified server-side so the client cannot invent a
    // category. Paid pages that the organic classifier deliberately rejects
    // (/care/{city}) may declare one, but only from a closed allowlist — they
    // must never be able to claim 'provider', 'benefit' or 'editorial' and so
    // leak paid traffic into the organic reporting path.
    const declared = typeof body.page_category === "string" ? body.page_category : "";
    const category = pagePath
      ? (classifyOrganicPage(pagePath) ?? (NON_ORGANIC_CATEGORIES.has(declared) ? declared : null))
      : null;
    if (
      !CLIENT_EVENTS.has(eventType) || !anonymousId || !visitId || !pagePath || !category
      || anonymousId.length > 128 || visitId.length > 128 || pagePath.length > 1_000
    ) {
      return NextResponse.json({ error: "Invalid growth event" }, { status: 400 });
    }
    const metadata = body.metadata && typeof body.metadata === "object"
      ? body.metadata as Record<string, unknown>
      : {};
    const db = getServiceDb();
    if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    const referrer = shortText(metadata.referrer, 2_000);
    const safeMetadata = {
      referrer: sanitizeReferrer(referrer),
      referrer_class: classifyReferrer(referrer),
      utm_source: shortText(metadata.utm_source),
      utm_medium: shortText(metadata.utm_medium),
      utm_campaign: shortText(metadata.utm_campaign, 300),
      gclid: metadata.gclid === true,
      contact_kind: shortText(metadata.contact_kind, 80),
      ua_class: classifyUserAgent(userAgent),
      // THIS OBJECT IS AN ALLOWLIST, AND THAT IS EASY TO MISS.
      //
      // `metadata` arrives from the client whole, but only the fields named
      // here are stored; everything else is dropped without an error. The
      // landing-arm experiment shipped on 11 Sep sending `{ arm }` on every
      // event and lost every one of them, because `arm` was not on this list.
      // Nothing failed: the insert succeeded, the row looked normal, and the
      // per-arm rollup read null and skipped it. Roughly 90 minutes of
      // production landings are unattributable as a result.
      //
      // So: a new metadata field needs a line HERE as well as in the client.
      // That makes four places a growth event has to be declared — the
      // GrowthClientEvent union, CLIENT_EVENTS above, the DB event_type CHECK,
      // and this object — and three of the four fail silently.
      //
      // Validated, not copied. `arm` is written by client JS, so an arbitrary
      // string would otherwise land in a column the admin dashboard renders.
      // An unrecognised value is stored as null, which the rollup already
      // treats as "not in the experiment".
      arm: isCityLandingArm(metadata.arm) ? metadata.arm : null,
      // Which screen a question_viewed fired on. Diagnostic only: it is what
      // tells you WHERE an arm loses people rather than just that it did.
      step: shortText(metadata.step, 40),
    };
    const { error } = await db.from("growth_attribution_events").insert({
      anonymous_id: anonymousId,
      visit_id: visitId,
      event_type: eventType,
      page_path: pagePath,
      page_category: category,
      cta_id: shortText(body.cta_id, 120),
      cta_surface: shortText(body.cta_surface, 120),
      traffic_channel: eventType === "page_landed" ? trafficChannel(metadata) : null,
      metadata: safeMetadata,
    });
    if (error) {
      // A deploy can precede the dashboard migration by a few minutes. Keep
      // the public UX healthy and make the activation state visible in admin.
      console.error("[track-growth] insert failed:", error);
      return new NextResponse(null, { status: 204 });
    }
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

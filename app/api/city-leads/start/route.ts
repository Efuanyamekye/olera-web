import { NextRequest, NextResponse } from "next/server";
import { isBotRequest, incrementBotReject } from "@/lib/analytics/bot-filter";
import { sendSlackAlert, slackCityQuizStarted } from "@/lib/slack";
import {
  RECIPIENT_LABEL,
  classifyCityTraffic,
  getCityConfig,
  type CityRecipient,
} from "@/lib/city-ads/config";
import { getSiteUrl } from "@/lib/site-url";

/**
 * POST /api/city-leads/start — someone answered the first question on /care/{city}.
 *
 * Fire-and-forget Slack ping, nothing else. It writes no row: a start is not a
 * lead, there are no contact details, and inventing a half-lead in `city_leads`
 * would corrupt the one table the 20 Sep flight read depends on. The funnel
 * count lives in growth_attribution_events (`cta_engaged` / `lead_started`);
 * this endpoint exists purely so a human hears about it in real time.
 *
 * The client fires it once per session. That is the only dedup — there is no
 * server-side store, and a duplicate ping is a far smaller problem than a
 * missed one, so no attempt is made to be clever about it.
 */
/**
 * Per-IP throttle. The lead route caps abuse by counting `city_leads` rows,
 * which this endpoint cannot do because it deliberately writes none — so a
 * public, unauthenticated route that posts to Slack would otherwise be a
 * one-line channel-flood. In-memory means per warm instance rather than
 * global, which stops accidental retry loops and casual abuse without
 * building a distributed limiter for an endpoint that sees ~7 visitors a day.
 */
const STARTS_PER_IP_PER_HOUR = 5;
const WINDOW_MS = 60 * 60 * 1000;
const recentStarts = new Map<string, number[]>();

/** Same derivation the lead route uses, so both throttles key on one identity. */
function clientIp(req: NextRequest): string | null {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim().slice(0, 64);
  return req.headers.get("x-real-ip");
}

function throttled(ip: string | null): boolean {
  if (!ip) return false;
  const now = Date.now();
  const hits = (recentStarts.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= STARTS_PER_IP_PER_HOUR) {
    recentStarts.set(ip, hits);
    return true;
  }
  hits.push(now);
  recentStarts.set(ip, hits);
  // Bound the map so a long-lived instance cannot grow it without limit.
  if (recentStarts.size > 500) {
    for (const [k, v] of recentStarts) {
      if (v.every((t) => now - t >= WINDOW_MS)) recentStarts.delete(k);
    }
  }
  return false;
}

export async function POST(req: NextRequest) {
  // Same bot gate the growth tracker uses. /care/* is noindex and paid-only,
  // so genuine traffic is low and a crawler would otherwise be indistinguishable
  // from a family in the channel.
  if (isBotRequest(req.headers.get("user-agent"))) {
    incrementBotReject();
    return new NextResponse(null, { status: 204 });
  }

  // 204, not 429: this is a silent notification the visitor never sees, and a
  // status code would tell an abuser exactly where the limit is.
  if (throttled(clientIp(req))) return new NextResponse(null, { status: 204 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const cfg = getCityConfig(String(body.slug ?? ""));
  if (!cfg) return NextResponse.json({ error: "Unknown city" }, { status: 404 });

  // hasOwnProperty, not `in`: `in` walks the prototype chain, so a posted
  // recipient of "toString" or "constructor" passes an `in` guard and yields a
  // FUNCTION, which then gets interpolated into the Slack message. This is an
  // unauthenticated public endpoint, so the input is hostile by default.
  const rawRecipient = String(body.recipient ?? "");
  const rawLabel = Object.prototype.hasOwnProperty.call(RECIPIENT_LABEL, rawRecipient)
    ? RECIPIENT_LABEL[rawRecipient as CityRecipient]
    : null;
  const recipientLabel = typeof rawLabel === "string" ? rawLabel : null;

  const utm = (body.utm ?? {}) as Record<string, string | null>;
  const { paid, channel } = classifyCityTraffic(utm);

  const alert = slackCityQuizStarted({
    city: cfg.city,
    recipientLabel,
    channel,
    campaignTag: utm.campaign ?? cfg.campaignTag,
    paid,
    adminUrl: `${getSiteUrl()}/admin/city-ads`,
  });

  // Awaited: a serverless function may be frozen the moment the response is
  // sent (feedback_serverless_fire_and_forget). Failures are swallowed — a
  // missed notification must never surface an error to a family mid-form.
  try {
    await sendSlackAlert(alert.text, alert.blocks);
  } catch (err) {
    console.error("[city-leads/start] slack failed", err);
  }

  return new NextResponse(null, { status: 204 });
}

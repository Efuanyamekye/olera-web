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
export async function POST(req: NextRequest) {
  // Same bot gate the growth tracker uses. /care/* is noindex and paid-only,
  // so genuine traffic is low and a crawler would otherwise be indistinguishable
  // from a family in the channel.
  if (isBotRequest(req.headers.get("user-agent"))) {
    incrementBotReject();
    return new NextResponse(null, { status: 204 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const cfg = getCityConfig(String(body.slug ?? ""));
  if (!cfg) return NextResponse.json({ error: "Unknown city" }, { status: 404 });

  const rawRecipient = String(body.recipient ?? "");
  const recipientLabel =
    rawRecipient in RECIPIENT_LABEL
      ? RECIPIENT_LABEL[rawRecipient as CityRecipient]
      : null;

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

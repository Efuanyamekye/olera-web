import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";
import { markAdsLeadConversion } from "@/lib/ad-boost/ads-conversion.server";
import { normalizeUSPhone, sendSMS } from "@/lib/twilio";
import { sendSlackAlert, slackCityLead } from "@/lib/slack";
import {
  cityFamilyConfirmSms,
  cityFamilyConfirmMorningSms,
  cityFamilyConciergeSms,
  cityFamilyMedicalSms,
} from "@/lib/sms/templates";
import {
  CARE_LABEL,
  CITY_FORM_VERSION,
  RECIPIENT_LABEL,
  URGENCY_LABEL,
  classifyCityTraffic,
  formatUSPhone,
  getCityConfig,
  isStaffedNow,
} from "@/lib/city-ads/config";
import { startOrAdvance } from "@/lib/city-ads/offers.server";
import { ensureCareSeekerForCityLead, syncCityLeadDetails } from "@/lib/city-ads/care-seeker.server";
import { getSiteUrl } from "@/lib/site-url";
import { sendMetaLeadEvent } from "@/lib/city-ads/meta-capi.server";

/**
 * POST /api/city-leads — the /care/{city} form.
 *
 * Writes a PRIVATE lead row (no account, no public profile), records consent
 * proof, alerts Slack, texts the family a confirmation, and starts the offer
 * chain. Idempotent on the same phone + city inside 24h so a double tap or a
 * retry does not produce two chains.
 *
 * PATCH /api/city-leads — the optional post-submit fields (payment type, note).
 * Keyed by lead id + phone so nobody can annotate a lead they did not create.
 *
 * Deliberately NOT /api/connections/request: that route hard-requires a
 * provider and its guest path creates an auth user plus a family profile.
 */

const CARE_TYPES = new Set(["home_care", "assisted_living", "unsure", "medical"]);
const RECIPIENTS = new Set(["parent", "spouse", "self", "other"]);
const URGENCIES = new Set(["this_week", "this_month", "planning"]);
const PAYMENTS = new Set(["private_pay", "medicaid", "va", "ltc_insurance", "unsure"]);

function clientIp(req: NextRequest): string | null {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim().slice(0, 64);
  return req.headers.get("x-real-ip");
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const slug = String(body.slug ?? "");
  const cfg = getCityConfig(slug);
  if (!cfg) return NextResponse.json({ error: "Unknown city" }, { status: 404 });

  const careType = String(body.careType ?? "");
  const recipient = body.careRecipient ? String(body.careRecipient) : null;
  const urgency = body.urgency ? String(body.urgency) : null;
  const firstName = String(body.firstName ?? "").trim().slice(0, 60);
  const phone = normalizeUSPhone(String(body.phone ?? ""));
  const email = body.email ? String(body.email).trim().slice(0, 200).toLowerCase() : null;
  const zip = body.zip ? String(body.zip).replace(/\D/g, "").slice(0, 5) : null;
  const consent = body.consent === true;

  if (!CARE_TYPES.has(careType)) return NextResponse.json({ error: "Pick the kind of help." }, { status: 400 });
  if (recipient && !RECIPIENTS.has(recipient)) return NextResponse.json({ error: "Bad recipient" }, { status: 400 });
  if (urgency && !URGENCIES.has(urgency)) return NextResponse.json({ error: "Bad timing" }, { status: 400 });
  if (!firstName) return NextResponse.json({ error: "Add your first name." }, { status: 400 });
  if (!phone) return NextResponse.json({ error: "Add a mobile number so the provider can call you." }, { status: 400 });
  if (!consent) return NextResponse.json({ error: "Please tick the box so a provider can contact you." }, { status: 400 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "That email does not look right." }, { status: 400 });

  const db = getServiceClient();
  const ip = clientIp(req);
  const now = new Date();

  // Abuse cap: 5 leads per IP per hour.
  if (ip) {
    const { count } = await db
      .from("city_leads")
      .select("id", { count: "exact", head: true })
      .eq("consent_ip", ip)
      .gte("created_at", new Date(now.getTime() - 60 * 60 * 1000).toISOString());
    if ((count ?? 0) >= 5) return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  // Idempotency: same phone + city in 24h returns the existing lead. A stopped
  // request does not count; the family may genuinely be asking again.
  const { data: existing } = await db
    .from("city_leads")
    .select("id, status, care_type")
    .eq("slug", slug)
    .eq("phone", phone)
    .neq("status", "stopped")
    .gte("created_at", new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: true, leadId: existing.id, duplicate: true, redirected: existing.care_type === "medical" });
  }

  const utm = (body.utm && typeof body.utm === "object" ? body.utm : {}) as Record<string, unknown>;
  const str = (v: unknown, n = 120) => (v ? String(v).slice(0, n) : null);
  const isMedical = careType === "medical";

  const { data: lead, error } = await db
    .from("city_leads")
    .insert({
      slug,
      campaign_tag: str(utm.campaign) ?? cfg.campaignTag,
      utm_source: str(utm.source),
      utm_medium: str(utm.medium),
      utm_campaign: str(utm.campaign),
      gclid: str(utm.gclid, 200),
      fbclid: str(utm.fbclid, 200),
      session_id: str(body.sessionId),
      landing_arm: str(body.landingArm),
      care_recipient: recipient,
      care_type: careType,
      urgency,
      zip,
      first_name: firstName,
      phone,
      email,
      consent_at: now.toISOString(),
      consent_ip: ip,
      consent_ua: req.headers.get("user-agent")?.slice(0, 300) ?? null,
      consent_form_version: str(body.formVersion) ?? CITY_FORM_VERSION,
      status: isMedical ? "redirected" : "new",
    })
    .select("id")
    .single();
  if (error || !lead) {
    console.error("[city-leads] insert failed", error);
    return NextResponse.json({ error: "Could not save your request. Please try again." }, { status: 500 });
  }

  // Give the family a care seeker profile, and link it. This is what makes the
  // lead openable in the admin queue and, because the FK cascades, deletable
  // from there. Done for medical requests too — they are redirected rather than
  // routed, but they are still a real family and still need a record that can
  // be opened and cleared.
  //
  // Awaited, not fired off: a serverless function may be frozen the moment the
  // response is returned (feedback_serverless_fire_and_forget). Never throws;
  // an unlinked lead is recoverable, a failed submission is not.
  const careSeekerId = await ensureCareSeekerForCityLead(db, {
    firstName,
    phone,
    email,
    city: cfg.city,
    state: cfg.state,
    careType,
    careRecipient: recipient,
    urgency,
    note: null,
  });
  if (careSeekerId) {
    await db.from("city_leads").update({ care_seeker_id: careSeekerId }).eq("id", lead.id);
  }

  const careLabel = CARE_LABEL[careType as keyof typeof CARE_LABEL];
  const who = RECIPIENT_LABEL[(recipient ?? "other") as keyof typeof RECIPIENT_LABEL];
  const when = urgency ? URGENCY_LABEL[urgency as keyof typeof URGENCY_LABEL] : "";

  if (isMedical) {
    await sendSlackAlert(
      `City lead (${cfg.city}) redirected, medical scope: ${firstName}, ${formatUSPhone(phone)}, ${who}. Not offered to providers.`,
    );
    await sendSMS({
      to: phone,
      body: cityFamilyMedicalSms({ firstName }),
      emailType: "city_lead_family_medical",
      recipientType: "family",
      metadata: { lead_id: lead.id },
    });
    return NextResponse.json({ ok: true, leadId: lead.id, redirected: true });
  }

  const staffed = isStaffedNow(cfg.timeZone);
  // Paid means the ads produced this, which is the event the pilot exists to
  // produce. A gclid is proof of a Google click; our own utm_source covers
  // Nextdoor and anything else we tag.
  const { paid, channel } = classifyCityTraffic({
    source: str(utm.source),
    medium: str(utm.medium),
    gclid: str(utm.gclid),
    fbclid: str(utm.fbclid),
  });
  const concierge = cfg.routingMode === "concierge";
  const alert = slackCityLead({
    city: cfg.city,
    firstName,
    phone: formatUSPhone(phone),
    careLabel,
    recipientLabel: who,
    urgencyLabel: when || "not stated",
    zip,
    channel: channel ?? null,
    campaignTag: str(utm.campaign) ?? cfg.campaignTag,
    paid,
    concierge,
    nextStep: concierge
      ? staffed
        ? "*CALL THEM* — concierge city, no provider chain will run"
        : "*CALL THEM IN THE MORNING* — concierge city, no provider chain will run"
      : staffed
        ? "Offering to the first provider now"
        : "Outside staffed hours — parked until 8am local",
    adminUrl: `${getSiteUrl()}/admin/city-ads`,
  });
  await sendSlackAlert(alert.text, alert.blocks);
  await sendSMS({
    to: phone,
    body: concierge
      ? cityFamilyConciergeSms({ firstName, city: cfg.city, today: staffed })
      : staffed
        ? cityFamilyConfirmSms({ firstName, city: cfg.city })
        : cityFamilyConfirmMorningSms({ firstName, city: cfg.city }),
    emailType: "city_lead_family_confirm",
    recipientType: "family",
    metadata: { lead_id: lead.id, routing: cfg.routingMode },
  });

  // A concierge city has no provider on the hook, so the chain must not run:
  // it would text a family that a provider is coming when none is. The lead
  // waits in Needs you until a human calls, or hands it to a provider by name.
  if (!concierge) {
    // Awaited on purpose: a serverless function may be frozen after the response
    // (feedback_serverless_fire_and_forget).
    try {
      await startOrAdvance(db, lead.id);
    } catch (err) {
      console.error("[city-leads] chain start failed", err);
    }
  }

  // Google Ads conversion, same choke point every other lead route uses: this
  // sets the one-shot cookie AdsConversionPing (root layout) turns into the
  // gtag event. Without it the city campaigns report 0 conversions in Google
  // forever, however many real leads arrive — and the day-14 read that decides
  // the next flight would see that false zero.
  //
  // Fired for routable leads only. Medical requests return above: they are
  // redirected and never offered to a provider, so counting them would inflate
  // the one column the flight is judged on. Duplicates return earlier for the
  // same reason.
  //
  // Awaited: the cookie rides on the response headers (feedback_serverless_fire_and_forget).
  await markAdsLeadConversion();

  // Meta conversion, server half. Fired unconditionally rather than only for
  // fbclid traffic: Meta joins the event to a click itself, and a lead it does
  // not recognise is discarded on their side. Same gate as the Google
  // conversion above — routable leads only, medical and duplicates returned
  // earlier. Deduplicated against the browser pixel by metaEventId.
  await sendMetaLeadEvent({
    eventId: str(body.metaEventId, 100) ?? lead.id,
    eventSourceUrl: `${getSiteUrl()}/care/${cfg.slug}`,
    clientIp: (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null,
    userAgent: req.headers.get("user-agent"),
    fbp: req.cookies.get("_fbp")?.value ?? null,
    fbc: req.cookies.get("_fbc")?.value ?? null,
    fbclid: str(utm.fbclid),
    firstName,
    phone,
    email,
    zip,
    city: cfg.city,
    state: cfg.state,
  });

  return NextResponse.json({ ok: true, leadId: lead.id, redirected: false, staffed, concierge });
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const leadId = String(body.leadId ?? "");
  const phone = normalizeUSPhone(String(body.phone ?? ""));
  if (!leadId || !phone) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.paymentType && PAYMENTS.has(String(body.paymentType))) patch.payment_type = String(body.paymentType);
  if (typeof body.note === "string") patch.note = body.note.trim().slice(0, 600) || null;
  if (Object.keys(patch).length === 1) return NextResponse.json({ ok: true });
  const db = getServiceClient();
  const { data: updated, error } = await db
    .from("city_leads")
    .update(patch)
    .eq("id", leadId)
    .eq("phone", phone)
    .select("care_seeker_id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not save." }, { status: 500 });
  // Carry the same two answers onto the profile, so the record an admin opens
  // during the concierge call has the situation on it and not just a name.
  if (updated?.care_seeker_id) {
    await syncCityLeadDetails(db, updated.care_seeker_id as string, {
      paymentType: patch.payment_type as string | undefined,
      note: patch.note as string | undefined,
    });
  }
  return NextResponse.json({ ok: true });
}

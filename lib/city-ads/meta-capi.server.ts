import { createHash } from "node:crypto";
import { META_PIXEL_ID, isMetaPixelConfigured } from "./meta";

/**
 * Meta Conversions API — the server half of the city-campaign Lead event.
 *
 * Why bother when the browser pixel already fires: the city arms are volume
 * starved. Meta needs ~50 conversions per ad set per week to leave the learning
 * phase and we will produce a fraction of that, so every event that iOS or an
 * ad blocker eats (commonly 20-40% of them) is delivery quality we cannot spare.
 * The server sees the lead unconditionally and knows the family's real contact
 * details, which is also the strongest match signal Meta accepts.
 *
 * Deduplicated against the browser pixel by `event_id` — both halves send the
 * same one. See lib/city-ads/meta.ts for what we deliberately do NOT send.
 */

const GRAPH_VERSION = "v21.0";
const ACCESS_TOKEN = process.env.META_CAPI_ACCESS_TOKEN ?? "";
/** Set only while verifying in Events Manager > Test Events. Unset in prod. */
const TEST_EVENT_CODE = process.env.META_TEST_EVENT_CODE ?? "";

function sha256(v: string): string {
  return createHash("sha256").update(v).digest("hex");
}

/** Meta wants every identifier trimmed, lowercased and SHA-256 hex before it leaves us. */
function hashed(v: string | null | undefined): string[] | undefined {
  const s = (v ?? "").trim().toLowerCase();
  return s ? [sha256(s)] : undefined;
}

/** Digits only, with the country code and no leading +, per Meta's phone spec. */
function hashedPhone(phone: string | null | undefined): string[] | undefined {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 10) return undefined;
  const withCountry = digits.length === 10 ? `1${digits}` : digits;
  return [sha256(withCountry)];
}

/** Meta's own cookie format for a click id, when the pixel never got to set _fbc. */
function fbcFromClickId(fbclid: string | null | undefined, at: number): string | undefined {
  const id = (fbclid ?? "").trim();
  return id ? `fb.1.${at}.${id}` : undefined;
}

export interface MetaLeadEvent {
  /** Must equal the eventID the browser pixel fired, or Meta counts it twice. */
  eventId: string;
  eventSourceUrl: string;
  clientIp: string | null;
  userAgent: string | null;
  /** The _fbp / _fbc cookies the pixel set on this browser, if we have them. */
  fbp: string | null;
  fbc: string | null;
  fbclid: string | null;
  firstName: string | null;
  phone: string | null;
  email: string | null;
  zip: string | null;
  city: string | null;
  state: string | null;
}

/**
 * Never throws and never blocks the lead. A dropped conversion event costs us
 * delivery quality; a thrown one would cost us the family's submission.
 *
 * Must be AWAITED by the caller — a serverless function can be frozen the
 * moment its response is returned (feedback_serverless_fire_and_forget).
 */
export async function sendMetaLeadEvent(ev: MetaLeadEvent): Promise<void> {
  if (!isMetaPixelConfigured() || !ACCESS_TOKEN) return;

  const nowMs = Date.now();
  const payload = {
    data: [
      {
        event_name: "Lead",
        event_time: Math.floor(nowMs / 1000),
        event_id: ev.eventId,
        event_source_url: ev.eventSourceUrl,
        action_source: "website",
        user_data: {
          em: hashed(ev.email),
          ph: hashedPhone(ev.phone),
          fn: hashed(ev.firstName),
          zp: hashed((ev.zip ?? "").replace(/\D/g, "").slice(0, 5)),
          ct: hashed((ev.city ?? "").replace(/[^a-zA-Z]/g, "")),
          st: hashed(ev.state),
          country: hashed("us"),
          client_ip_address: ev.clientIp ?? undefined,
          client_user_agent: ev.userAgent ?? undefined,
          fbp: ev.fbp ?? undefined,
          fbc: ev.fbc ?? fbcFromClickId(ev.fbclid, nowMs),
        },
      },
    ],
    ...(TEST_EVENT_CODE ? { test_event_code: TEST_EVENT_CODE } : {}),
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${META_PIXEL_ID}/events?access_token=${encodeURIComponent(ACCESS_TOKEN)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        // Bounded because this is awaited on the family's submit path. The lead
        // is already saved by the time we get here, so a hang would cost the
        // family their confirmation screen over an analytics call — they would
        // see a failure for a request that actually succeeded. Losing the event
        // is the cheaper failure.
        signal: AbortSignal.timeout(4000),
      },
    );
    if (!res.ok) {
      // Log the body: Meta's 400s name the exact field, and a silent failure
      // here reads downstream as "Meta doesn't convert" — the false negative
      // this whole instrument exists to avoid.
      console.error("[city-leads] Meta CAPI rejected", res.status, await res.text().catch(() => ""));
    }
  } catch (err) {
    console.error("[city-leads] Meta CAPI failed", err);
  }
}

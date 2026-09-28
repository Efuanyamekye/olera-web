import type { Metadata } from "next";
import { getServiceClient } from "@/lib/admin";
import { validateCityOfferToken } from "@/lib/claim-tokens";
import { getLeadExchange, type ExchangeTurn } from "@/lib/city-ads/exchange.server";
import { CARE_LABEL, PAYMENT_LABEL, RECIPIENT_LABEL, URGENCY_LABEL, formatUSPhone, formatUntil, getCityConfig, hourIn } from "@/lib/city-ads/config";

/**
 * /p/offer/{token} — what a provider sees when they open an offer link.
 *
 * Reads only. The two buttons POST to /api/city-offers/respond. Four states:
 * open (take or pass), taken by this provider (the family's details), taken by
 * someone else or closed, passed (ask the reason if missing). No sign-in: the
 * signed token is the credential, and it only ever unlocks one offer.
 */

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "A family's request | Olera", robots: { index: false, follow: false } };

type Params = { token: string };

export default async function OfferPage({ params }: { params: Promise<Params> }) {
  const { token } = await params;
  const v = validateCityOfferToken(token);
  if (!v.valid) return <Shell title="This link is not valid">Ask Olera to resend it: support@olera.care.</Shell>;

  const db = getServiceClient();
  const { data: offer } = await db.from("city_lead_offers").select("*").eq("id", v.offerId).maybeSingle();
  if (!offer) return <Shell title="This request is no longer available">It may have been withdrawn. Nothing to do.</Shell>;

  const [{ data: lead }, { data: provider }] = await Promise.all([
    db.from("city_leads").select("*").eq("id", offer.lead_id).maybeSingle(),
    db.from("business_profiles").select("id, display_name").eq("id", offer.provider_id).maybeSingle(),
  ]);
  if (!lead) return <Shell title="This request is no longer available">Nothing to do.</Shell>;

  // The family's own words. Read before the branches below because every
  // state wants them: deciding, already taken, and passed all read better with
  // the thing she actually said than with a generated summary line.
  const exchange = await getLeadExchange(db, lead);

  const cfg = getCityConfig(lead.slug);
  const city = cfg?.city ?? lead.slug;
  const careLabel = CARE_LABEL[lead.care_type as keyof typeof CARE_LABEL] ?? "care";
  const who = RECIPIENT_LABEL[(lead.care_recipient ?? "other") as keyof typeof RECIPIENT_LABEL];
  const when = lead.urgency ? URGENCY_LABEL[lead.urgency as keyof typeof URGENCY_LABEL] : "";
  const pay = lead.payment_type ? PAYMENT_LABEL[lead.payment_type] : null;
  const callBy = hourIn(cfg?.timeZone ?? "America/New_York") < 17 ? "today" : "by noon tomorrow";
  const providerName = provider?.display_name ?? "your team";

  const summary = (
    <div className="rounded-xl border border-gray-200 bg-white p-4 text-[15px] leading-relaxed text-gray-800">
      A family in <b>{city}</b> is looking for <b>{careLabel}</b> for {who}
      {when ? `, ${when}` : ""}
      {pay ? `, ${pay}` : ""}
      {lead.zip ? ` · ZIP ${lead.zip}` : ""}.
    </div>
  );

  const words = <Exchange turns={exchange} />;

  // 1. Taken by this provider: the details.
  if (offer.accepted_at && lead.accepted_offer_id === offer.id) {
    return (
      <Shell title={`It is yours. Call ${lead.first_name} ${callBy}.`} eyebrow={`Olera · ${city}`}>
        <div className="rounded-xl border border-primary-200 bg-primary-25 p-4">
          <div className="text-xl font-semibold text-gray-900">{lead.first_name}</div>
          <a className="mt-1 block text-lg font-semibold text-primary-700" href={`tel:${lead.phone}`}>
            {formatUSPhone(lead.phone)}
          </a>
          {lead.email && <div className="mt-1 text-sm text-gray-600">{lead.email}</div>}
          <div className="mt-3 text-[15px] text-gray-800">
            {careLabel} for {who}
            {when ? `, ${when}` : ""}
            {pay ? ` · ${pay}` : ""}
            {lead.zip ? ` · ZIP ${lead.zip}` : ""}
          </div>
        </div>
        {words}
        <p className="mt-4 text-sm text-gray-600">
          We told {lead.first_name} to expect your call {callBy}. We will check with them tomorrow, and pass the request to another provider if they have not heard from you.
        </p>
        {/* The conversation lives in the inbox; this page used to end here. */}
        <a
          href={`/portal/inbox?role=provider&ad=${lead.id}`}
          className="mt-4 inline-block rounded-xl border border-gray-300 px-4 py-2.5 text-[15px] font-semibold text-gray-900 hover:border-gray-900"
        >
          Message {lead.first_name} in your inbox
        </a>
      </Shell>
    );
  }

  // 1b. Taken, then moved on to another agency (the follow-up ladder, or
  // Move on the case page). Without this the page fell through to the open
  // state and showed a Take button that could no longer do anything.
  if (offer.accepted_at && (offer.outcome === "moved" || offer.outcome === "no_contact")) {
    return (
      <Shell title="This family has moved on" eyebrow={`Olera · ${city}`}>
        <p className="text-[15px] text-gray-700">
          We&rsquo;ve connected them with another agency, so there&rsquo;s nothing more to do here. The next family near you will come the same way.
        </p>
      </Shell>
    );
  }

  // 2. Taken by someone else, or the lead is closed.
  const closed = ["client", "no_fit", "stopped", "unreachable", "redirected"].includes(lead.status);
  if ((lead.accepted_offer_id && lead.accepted_offer_id !== offer.id) || closed) {
    return (
      <Shell title="This one was already taken" eyebrow={`Olera · ${city}`}>
        {summary}
        <p className="mt-4 text-sm text-gray-600">Another provider took it first, or the family&rsquo;s request has closed. The next offer will come the same way.</p>
      </Shell>
    );
  }

  // 3. Passed: ask the reason once.
  if (offer.declined_at) {
    return (
      <Shell title="You passed on this one" eyebrow={`Olera · ${city}`}>
        {summary}
        {!offer.decline_reason && (
          <form method="post" action="/api/city-offers/respond" className="mt-4">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="action" value="reason" />
            <p className="mb-2 text-sm text-gray-700">One thing that helps us send you better ones. Why?</p>
            <div className="flex flex-wrap gap-2">
              {[
                ["capacity", "No capacity right now"],
                ["area", "Outside our area"],
                ["payment", "Payment type"],
                ["medical", "Needs medical care"],
                ["other", "Something else"],
              ].map(([v2, label]) => (
                <button key={v2} name="reason" value={v2} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 hover:border-primary-400">
                  {label}
                </button>
              ))}
            </div>
          </form>
        )}
        {offer.decline_reason && <p className="mt-4 text-sm text-gray-600">Noted, thank you. The next offer will come the same way.</p>}
      </Shell>
    );
  }

  // 4. Open. Take or pass. A late click may still win; the claim decides.
  const late = new Date(offer.expires_at) < new Date();
  return (
    <Shell title={`A family in ${city} needs ${careLabel}`} eyebrow={`Olera · offered to ${providerName}`}>
      {summary}
      {words}
      <p className="mt-3 text-sm text-gray-600">
        {late
          ? "The next provider has been asked too, but if nobody has taken it yet, you still can."
          : `It's yours until ${formatUntil(cfg?.timeZone ?? "America/New_York", new Date(offer.expires_at))} before we offer it to the next provider. Take it and their name and number appear here.`}
      </p>
      <form method="post" action="/api/city-offers/respond" className="mt-5 grid gap-2">
        <input type="hidden" name="token" value={token} />
        <button name="action" value="take" className="block w-full rounded-xl bg-primary-700 px-4 py-3.5 text-center text-base font-semibold text-white hover:bg-primary-600">
          Take this family
        </button>
        <button name="action" value="pass" className="block w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-center text-[15px] font-medium text-gray-700 hover:bg-gray-50">
          Pass, offer it to the next provider
        </button>
      </form>
      <p className="mt-4 text-xs text-gray-500">Free during the pilot. Olera does not sell this request. Questions: support@olera.care.</p>
    </Shell>
  );
}

/**
 * What the family actually wrote.
 *
 * No name and no contact details: this renders before a provider has claimed
 * the request, and the relay's whole premise is that those move only on a YES.
 * getLeadExchange redacts anything the family typed into the body herself.
 */
function Exchange({ turns }: { turns: ExchangeTurn[] }) {
  const said = turns.filter((t) => t.who === "family");
  if (said.length === 0) return null;
  const asked = turns.find((t) => t.who === "olera");
  return (
    <div className="mt-3 rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">In their words</p>
      {asked && <p className="mt-2 text-sm text-gray-500">We asked: {asked.text}</p>}
      <div className="mt-2 grid gap-2">
        {said.map((t, i) => (
          <p key={i} className="rounded-lg bg-gray-50 px-3 py-2 text-[15px] leading-relaxed text-gray-900">
            &ldquo;{t.text}&rdquo;
          </p>
        ))}
      </div>
    </div>
  );
}

function Shell({ title, eyebrow, children }: { title: string; eyebrow?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-vanilla-50 text-gray-900">
      <div className="mx-auto max-w-md px-5 pb-16 pt-6 sm:max-w-lg">
        <div className="text-sm font-semibold tracking-wide text-primary-700">Olera</div>
        {eyebrow && <p className="mt-6 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{eyebrow}</p>}
        <h1 className="mt-1 font-display text-[1.75rem] leading-[1.15] text-gray-900">{title}</h1>
        <div className="mt-5 text-[15px] text-gray-700">{children}</div>
      </div>
    </div>
  );
}

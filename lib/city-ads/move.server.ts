/**
 * Moving a family to another agency — server only.
 *
 * The case page's "Move to another agency": the agency holding the family has
 * not helped (most often, has not called), so the team sends the family on.
 * Until this, a family an agency had taken could only be moved by the
 * follow-up ladder (followups.server.ts rung 3), a day or more later and only
 * after the family replied "not yet".
 *
 * One move, in order:
 *   1. Release the holder. Their offer is marked "moved", which ends their hold
 *      (offer-holds.ts): the family leaves their inbox and replies stop
 *      reaching them. The lead's claim and follow-up stamps are cleared so the
 *      ladder starts fresh for whoever takes the family next.
 *   2. Offer the family to the agency the team picked, through the relay
 *      (startOrAdvance), so the offer, its clock and its texts are the usual ones.
 *   3. Tell the family by text that we are connecting them with someone else.
 *      No agency is named: the new one has not said yes yet. When it does,
 *      the acceptance text names it.
 *   4. Tell the released agency by email, so the family does not vanish from
 *      their inbox without a word.
 *   5. Slack.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { cityThreadProviderEmail } from "@/lib/email-templates";
import { sendSlackAlert } from "@/lib/slack";
import { getSiteUrl } from "@/lib/site-url";
import { CARE_LABEL, getCityConfig } from "@/lib/city-ads/config";
import { cityLeadBlocked, deliverCityMessage } from "@/lib/city-ads/messages.server";
import { startOrAdvance } from "@/lib/city-ads/offers.server";
import { offerStillHolds } from "@/lib/city-ads/offer-holds";

export type MoveResult =
  | { ok: true; message: string; offered: boolean }
  | { ok: false; error: string; status: number };

function firstWord(name: string | null | undefined): string {
  return String(name ?? "").trim().split(/\s+/)[0] || "The family";
}

export async function moveToProvider(
  db: SupabaseClient,
  leadId: string,
  toProviderId: string,
  by: string,
): Promise<MoveResult> {
  const { data: lead } = await db
    .from("city_leads")
    .select("id, slug, first_name, care_type, accepted_offer_id, archived_at, status")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { ok: false, error: "Family not found.", status: 404 };
  if (await cityLeadBlocked(db, leadId)) {
    return { ok: false, error: "This family is closed or asked us to stop, so they can't be moved.", status: 409 };
  }

  const { data: offers } = await db
    .from("city_lead_offers")
    .select("id, provider_id, accepted_at, outcome")
    .eq("lead_id", leadId)
    .not("accepted_at", "is", null);
  const holding = ((offers ?? []) as Array<{ id: string; provider_id: string; accepted_at: string | null; outcome: string | null }>).find(
    (o) => offerStillHolds(o, lead),
  );
  if (!holding) return { ok: false, error: "No agency has this family right now. Use Offer to… instead.", status: 409 };
  if (holding.provider_id === toProviderId) {
    return { ok: false, error: "That agency already has this family.", status: 409 };
  }

  const [{ data: from }, { data: to }] = await Promise.all([
    db.from("business_profiles").select("id, display_name, email").eq("id", holding.provider_id).maybeSingle(),
    db.from("business_profiles").select("id, display_name").eq("id", toProviderId).maybeSingle(),
  ]);
  if (!to) return { ok: false, error: "That agency wasn't found.", status: 404 };
  const fromName = (from?.display_name as string | null) ?? "The agency";
  const toName = (to.display_name as string | null) ?? "the next agency";
  const first = firstWord(lead.first_name as string | null);
  const city = getCityConfig(lead.slug as string)?.city ?? (lead.slug as string);
  const now = new Date().toISOString();

  // 1. Release the holder, and clear the ladder for whoever comes next.
  const { error: relErr } = await db.from("city_lead_offers").update({ outcome: "moved" }).eq("id", holding.id);
  if (relErr) throw relErr;
  const { error: leadErr } = await db
    .from("city_leads")
    .update({
      accepted_offer_id: null,
      status: "offered",
      reached_at: null,
      outcome: null,
      outcome_at: null,
      outcome_source: null,
      family_check_sent_at: null,
      family_check_reply: null,
      family_check_reply_at: null,
      provider_nudged_at: null,
      outcome_ping_1_at: null,
      outcome_ping_2_at: null,
      updated_at: now,
    })
    .eq("id", leadId);
  if (leadErr) throw leadErr;

  // 2. The offer, through the relay.
  const r = await startOrAdvance(db, leadId, { force: true, providerId: toProviderId });
  const offered = r.action === "offered";

  // 3. The family. Through the durable queue, so it shows on their thread
  //    page and the case page like any other text from us.
  if (offered) {
    const care = CARE_LABEL[lead.care_type as keyof typeof CARE_LABEL] ?? "care";
    const { data: queued, error: qErr } = await db
      .from("city_lead_messages")
      .insert({
        lead_id: leadId,
        channel: "sms",
        subject: null,
        body: `Olera: Hi ${first}, we're connecting you with another agency near ${city} for ${care}. They'll reach out soon.\n\nReply STOP to opt out, HELP for help.`,
        send_after: now,
        created_by: `admin:${by}`,
      })
      .select("id")
      .maybeSingle();
    if (qErr) console.error("[city-ads/move] family text queue failed", qErr);
    else if (queued?.id) {
      try {
        await deliverCityMessage(db, queued.id as string);
      } catch (e) {
        console.error("[city-ads/move] family text failed", e);
      }
    }
  }

  // 4. The released agency, by email.
  const fromEmail = (from?.email as string | null) ?? null;
  if (fromEmail) {
    try {
      await sendEmail({
        to: fromEmail,
        subject: `${first} has been connected with another agency`,
        html: cityThreadProviderEmail({
          eyebrow: `Olera · ${city}`,
          headline: `${first} has moved on`,
          body: `We've connected ${first} with another agency, so you don't need to follow up. When the next family is looking for care near you, we'll send them your way.`,
          ctaUrl: `${getSiteUrl()}/portal/inbox?role=provider`,
          ctaLabel: "Open your inbox",
        }),
        replyTo: "support@olera.care",
        emailType: "city_lead_moved_provider",
        recipientType: "provider",
        providerId: holding.provider_id,
        metadata: { lead_id: leadId, offer_id: holding.id },
      });
    } catch (e) {
      console.error("[city-ads/move] released-agency email failed", e);
    }
  }

  // 5. The team.
  await sendSlackAlert(
    `➡️ City lead ${leadId.slice(0, 8)} (${city}): ${by} moved ${first} from ${fromName} to ${toName}${offered ? "" : ` (offer not sent: ${r.action})`}. /admin/city-ads`,
  );

  return {
    ok: true,
    offered,
    message: offered
      ? `Moved. ${toName} has the offer, and ${first} was told we're connecting them with someone.`
      : `Released from ${fromName}, but the offer to ${toName} didn't go out (${r.action}).`,
  };
}

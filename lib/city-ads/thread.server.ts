/**
 * The shared family thread — server only.
 *
 * One timeline per family from a provider's own ad, seen by the provider, by
 * us, and (the message part only) by the family. Airbnb's co-host model: the
 * family deals with "Hoop Cares" and "Olera" side by side, everyone sees what
 * everyone else did, and nobody asks the same question twice.
 *
 * Nothing new is recorded except the words typed on our pages
 * (city_lead_thread). The rest is merged at read time from where it already
 * lives: our texts and emails (city_lead_messages), the family's texts to our
 * number (sms_inbound), our calls (family_touches, events only — Ces's
 * free-text notes stay internal), check-ins and outcomes (city_leads).
 *
 * CARRIER RULE. Our texting registration covers "a provider sent you a
 * message, read and reply here", not a provider's words relayed by text. So a
 * provider's message reaches the family as a text with a link, plus an email
 * that may carry the words; the words themselves are read on /f/thread/{token}.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendSMS, normalizeUSPhone } from "@/lib/twilio";
import { sendEmail } from "@/lib/email";
import { sendSlackAlert } from "@/lib/slack";
import { getSiteUrl } from "@/lib/site-url";
import { generateCityThreadUrl, generateFamilyInboxUrl } from "@/lib/claim-tokens";
import { cityThreadProviderEmail } from "@/lib/email-templates";
import { getCityConfig } from "@/lib/city-ads/config";
import { cityLeadBlocked, citySendWindow, deliverCityMessage } from "@/lib/city-ads/messages.server";
import { resolvePrimaryCampaign } from "@/lib/city-ads/primary.server";

export type ThreadAuthor = "olera" | "provider" | "family";

export interface ThreadEntry {
  at: string;
  author: ThreadAuthor;
  /** A message is words someone wrote; an event is something that happened. */
  kind: "message" | "event";
  text: string;
  channel?: "text" | "email" | "page" | "call";
}

export interface ThreadLead {
  id: string;
  slug: string;
  first_name: string;
  phone: string;
  email: string | null;
  created_at: string;
  handed_at: string | null;
  handed_request_id: string | null;
  care_seeker_id: string | null;
  archived_at: string | null;
  meta_campaign_id: string | null;
  qualification_reply: string | null;
  qualification_reply_at: string | null;
  family_check_sent_at: string | null;
  family_check_reply: string | null;
  family_check_reply_at: string | null;
  provider_nudged_at: string | null;
  outcome_ping_1_at: string | null;
  outcome_ping_2_at: string | null;
  outcome: string | null;
  outcome_at: string | null;
  outcome_source: string | null;
}

const LEAD_COLS =
  "id, slug, first_name, phone, email, created_at, handed_at, handed_request_id, care_seeker_id, archived_at, meta_campaign_id, qualification_reply, qualification_reply_at, family_check_sent_at, family_check_reply, family_check_reply_at, provider_nudged_at, outcome_ping_1_at, outcome_ping_2_at, outcome, outcome_at, outcome_source";

/** Most messages a provider can send one family in 24 hours. */
const PROVIDER_DAILY_LIMIT = 3;
/** Marks a queued notification as the provider's, not ours, in city_lead_messages. */
const PROVIDER_SENDER_PREFIX = "provider:";

export async function getThreadLead(db: SupabaseClient, leadId: string): Promise<ThreadLead | null> {
  const { data } = await db.from("city_leads").select(LEAD_COLS).eq("id", leadId).maybeSingle();
  return (data as ThreadLead | null) ?? null;
}

export function firstWordOf(name: string | null | undefined): string {
  return String(name ?? "").trim().split(/\s+/)[0] || "The family";
}

function last10(phone: string | null | undefined): string | null {
  const d = String(phone ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : null;
}

const OUTCOME_WORD: Record<string, string> = { talking: "Talked", client: "Became a client", no: "Not a fit" };

/**
 * The merged timeline, oldest first.
 *
 * `family` sees only messages (ours, the provider's, their own). Calls,
 * hand-overs, check-ins and outcomes are team context, not conversation.
 */
export async function getFamilyTimeline(
  db: SupabaseClient,
  lead: ThreadLead,
  opts: { audience: "provider" | "family"; providerName: string },
): Promise<ThreadEntry[]> {
  const first = firstWordOf(lead.first_name);
  const out: ThreadEntry[] = [];
  const phoneKey = last10(lead.phone);

  const [{ data: sent }, { data: typed }, { data: inbound }, { data: calls }] = await Promise.all([
    db
      .from("city_lead_messages")
      .select("body, channel, status, created_by, completed_at, created_at")
      .eq("lead_id", lead.id)
      .in("status", ["sent", "failed"])
      .order("created_at", { ascending: true }),
    db
      .from("city_lead_thread")
      .select("author, body, created_at")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: true }),
    phoneKey
      ? db
          .from("sms_inbound")
          .select("body, keyword, created_at")
          .eq("phone_last10", phoneKey)
          .gte("created_at", lead.created_at)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as Array<{ body: string; keyword: string | null; created_at: string }> }),
    lead.care_seeker_id && opts.audience === "provider"
      ? db
          .from("family_touches")
          .select("channel, reached, direction, occurred_at")
          .eq("seeker_id", lead.care_seeker_id)
          .eq("channel", "call")
          .order("occurred_at", { ascending: true })
      : Promise.resolve({ data: [] as Array<{ channel: string; reached: boolean | null; direction: string; occurred_at: string }> }),
  ]);

  for (const m of (sent ?? []) as Array<{ body: string; channel: string; status: string; created_by: string | null; completed_at: string | null; created_at: string }>) {
    // The "you have a message" notices we sent for the provider are plumbing;
    // her message itself is in the thread.
    if (m.created_by?.startsWith(PROVIDER_SENDER_PREFIX)) continue;
    const failed = m.status === "failed";
    if (failed && opts.audience === "family") continue;
    out.push({
      at: m.completed_at ?? m.created_at,
      author: "olera",
      kind: "message",
      channel: m.channel === "email" ? "email" : "text",
      text: failed ? `${m.body} (this ${m.channel === "email" ? "email" : "text"} didn't go through)` : m.body,
    });
  }
  for (const t of (typed ?? []) as Array<{ author: string; body: string; created_at: string }>) {
    out.push({ at: t.created_at, author: t.author === "provider" ? "provider" : "family", kind: "message", channel: "page", text: t.body });
  }
  for (const i of (inbound ?? []) as Array<{ body: string; keyword: string | null; created_at: string }>) {
    if (!i.body?.trim()) continue;
    out.push({ at: i.created_at, author: "family", kind: "message", channel: "text", text: i.body.trim() });
  }

  if (opts.audience === "provider") {
    out.push({ at: lead.created_at, author: "family", kind: "event", text: `${first} filled in your Facebook form.` });
    for (const c of (calls ?? []) as Array<{ reached: boolean | null; direction: string; occurred_at: string }>) {
      if (c.direction !== "out") continue;
      out.push({
        at: c.occurred_at,
        author: "olera",
        kind: "event",
        channel: "call",
        text: c.reached ? `Olera talked with ${first} by phone.` : `Olera called ${first}. No answer.`,
      });
    }
    if (lead.handed_at) {
      out.push({ at: lead.handed_at, author: "olera", kind: "event", text: `Olera passed ${first} to ${opts.providerName}.` });
    }
    if (lead.family_check_sent_at) {
      out.push({ at: lead.family_check_sent_at, author: "olera", kind: "event", text: `Olera asked ${first} if ${opts.providerName} had reached them.` });
    }
    if (lead.family_check_reply && lead.family_check_reply_at) {
      out.push({
        at: lead.family_check_reply_at,
        author: "family",
        kind: "event",
        text: lead.family_check_reply === "reached" ? `${first} said they had been reached.` : `${first} said they had not heard from anyone yet.`,
      });
    }
    if (lead.provider_nudged_at) {
      out.push({ at: lead.provider_nudged_at, author: "olera", kind: "event", text: `Olera reminded ${opts.providerName} that ${first} was waiting.` });
    }
    for (const ping of [lead.outcome_ping_1_at, lead.outcome_ping_2_at]) {
      if (ping) out.push({ at: ping, author: "olera", kind: "event", text: `Olera asked ${opts.providerName} how it went with ${first}.` });
    }
    if (lead.outcome && lead.outcome_at) {
      const who: ThreadAuthor =
        lead.outcome_source === "provider_app" || lead.outcome_source === "provider_sms"
          ? "provider"
          : lead.outcome_source === "family_sms"
            ? "family"
            : "olera";
      out.push({ at: lead.outcome_at, author: who, kind: "event", text: `Marked: ${OUTCOME_WORD[lead.outcome] ?? lead.outcome}.` });
    }
  }

  out.sort((a, b) => +new Date(a.at) - +new Date(b.at));
  return out;
}

export interface ThreadProvider {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  /**
   * Where she works this family. "campaign": the lead came from her own ad and
   * sits on her campaign page. "inbox": she took it as an offer, so it lives
   * in her inbox only.
   */
  via: "campaign" | "inbox";
}

/**
 * The provider who holds this family, with the details we need to reach her.
 *
 * A provider who took the family as an offer holds it, even when the ad was
 * someone else's: that is who the family is talking to. Otherwise the ad's
 * owner does.
 */
export async function threadProvider(db: SupabaseClient, lead: ThreadLead): Promise<ThreadProvider | null> {
  const { data: taken } = await db
    .from("city_lead_offers")
    .select("provider_id")
    .eq("lead_id", lead.id)
    .not("accepted_at", "is", null)
    .order("accepted_at", { ascending: false })
    .limit(1);
  const holderId = (taken?.[0]?.provider_id as string | undefined) ?? null;
  const primary = holderId ? null : await resolvePrimaryCampaign(db, lead);
  const id = holderId ?? primary?.providerId ?? null;
  if (!id) return null;
  const { data: p } = await db.from("business_profiles").select("id, display_name, phone, email").eq("id", id).maybeSingle();
  return {
    id,
    name: (p?.display_name as string | null) ?? primary?.providerName ?? "Your care provider",
    phone: p?.phone ? normalizeUSPhone(p.phone as string) : null,
    email: (p?.email as string | null) ?? null,
    via: holderId ? "inbox" : "campaign",
  };
}

/** The page where a provider reads and answers this family. */
export function providerThreadUrl(lead: ThreadLead, provider: ThreadProvider): string {
  return provider.via === "inbox"
    ? `${getSiteUrl()}/portal/inbox?role=provider&ad=${lead.id}`
    : `${getSiteUrl()}/provider/boost`;
}

/**
 * The same page from an email, signing her in on the way: the inbox shows
 * nothing to a signed-out visitor. Issued for the email she signs in with,
 * which can differ from the listing's public email. Texts keep the plain link,
 * because a text can reach a shared office line.
 */
async function providerEmailUrl(db: SupabaseClient, lead: ThreadLead, provider: ThreadProvider): Promise<string> {
  const plain = providerThreadUrl(lead, provider);
  if (provider.via !== "inbox") return plain;
  try {
    const { data: bp } = await db.from("business_profiles").select("account_id").eq("id", provider.id).maybeSingle();
    if (!bp?.account_id) return plain;
    const { data: acct } = await db.from("accounts").select("user_id").eq("id", bp.account_id).maybeSingle();
    if (!acct?.user_id) return plain;
    const { data } = await db.auth.admin.getUserById(acct.user_id as string);
    const email = data?.user?.email;
    return email ? generateFamilyInboxUrl(email, `/portal/inbox?role=provider&ad=${lead.id}`, getSiteUrl()) : plain;
  } catch (e) {
    console.error("[city-thread] sign-in link failed", e);
    return plain;
  }
}

/**
 * A provider writes to a family from her campaign page. The words are stored;
 * the family is told by text (link only) and by email (words + link), inside
 * the city's sending hours.
 */
export async function postProviderMessage(
  db: SupabaseClient,
  lead: ThreadLead,
  provider: { id: string; name: string },
  body: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const text = body.trim().slice(0, 2000);
  if (!text) return { ok: false, error: "Write a message first.", status: 400 };
  if (await cityLeadBlocked(db, lead.id)) {
    return { ok: false, error: `${firstWordOf(lead.first_name)} asked us to stop contacting them, so messages can't be sent.`, status: 409 };
  }
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await db
    .from("city_lead_thread")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", lead.id)
    .eq("author", "provider")
    .gte("created_at", since);
  if ((count ?? 0) >= PROVIDER_DAILY_LIMIT) {
    return { ok: false, error: `You've sent ${PROVIDER_DAILY_LIMIT} messages today. Give them a chance to reply, or call.`, status: 429 };
  }
  const { error } = await db
    .from("city_lead_thread")
    .insert({ lead_id: lead.id, author: "provider", author_profile_id: provider.id, body: text });
  if (error) {
    console.error("[city-thread] provider message insert failed", error);
    return { ok: false, error: "Couldn't send that. Try again in a moment.", status: 500 };
  }

  const url = generateCityThreadUrl(lead.id, getSiteUrl());
  const first = firstWordOf(lead.first_name);
  let window: { allowed: boolean; nextStart: string };
  try {
    window = citySendWindow(lead.slug);
  } catch {
    window = { allowed: true, nextStart: new Date().toISOString() };
  }
  const sendAfter = window.allowed ? new Date().toISOString() : window.nextStart;
  const createdBy = `${PROVIDER_SENDER_PREFIX}${provider.id}`;
  // One shape for both rows: the build's supabase-js rejects a union where
  // only one member carries `subject`.
  const rows: Array<{ lead_id: string; channel: string; subject: string | null; body: string; send_after: string; created_by: string }> = [
    {
      lead_id: lead.id,
      channel: "sms",
      subject: null,
      body: `Olera: ${provider.name} sent you a message about your care request. Read & reply: ${url}\n\nReply STOP to opt out, HELP for help.`,
      send_after: sendAfter,
      created_by: createdBy,
    },
    ...(lead.email
      ? [
          {
            lead_id: lead.id,
            channel: "email",
            subject: `${provider.name} sent you a message`,
            body: `Hi ${first},\n\n${provider.name} sent you a message about your care request:\n\n"${text}"\n\nRead and reply here: ${url}\n\nOlera`,
            send_after: sendAfter,
            created_by: createdBy,
          },
        ]
      : []),
  ];
  for (const row of rows) {
    // One pending message per lead per channel (city_lead_messages_pending).
    // A second message before the first notice goes out needs no second
    // notice: the link shows everything.
    const { data: inserted, error: qErr } = await db.from("city_lead_messages").insert(row).select("id").maybeSingle();
    if (qErr) {
      if (!/duplicate|unique/i.test(qErr.message)) console.error("[city-thread] notice queue failed", qErr);
      continue;
    }
    if (window.allowed && inserted?.id) {
      try {
        await deliverCityMessage(db, inserted.id as string);
      } catch (e) {
        console.error("[city-thread] notice delivery failed", e);
      }
    }
  }
  await sendSlackAlert(
    `💬 ${provider.name} messaged ${first} (city lead ${lead.id.slice(0, 8)}): "${text.slice(0, 200)}"${window.allowed ? "" : " Notice held until the morning."}`,
  );
  return { ok: true };
}

/** Tell the provider something happened with a family from her ad. */
export async function notifyProvider(
  db: SupabaseClient,
  lead: ThreadLead,
  provider: ThreadProvider,
  what: { sms: string; subject: string; headline: string; quote?: string | null; body: string; emailType: string },
): Promise<void> {
  const url = providerThreadUrl(lead, provider);
  if (provider.phone) {
    await sendSMS({
      to: provider.phone,
      body: `${what.sms} ${url}\n\nReply STOP to opt out, HELP for help.`,
      emailType: what.emailType,
      recipientType: "provider",
      recipientLogProfileId: provider.id,
      metadata: { lead_id: lead.id },
    });
  }
  if (provider.email) {
    await sendEmail({
      to: provider.email,
      subject: what.subject,
      html: cityThreadProviderEmail({
        eyebrow: `Olera · ${getCityConfig(lead.slug)?.city ?? "Your campaign"}`,
        headline: what.headline,
        quote: what.quote ?? null,
        body: what.body,
        ctaUrl: await providerEmailUrl(db, lead, provider),
        ctaLabel: provider.via === "inbox" ? "Open your inbox" : "Open your campaign",
      }),
      replyTo: "support@olera.care",
      emailType: what.emailType,
      recipientType: "provider",
      providerId: provider.id,
      metadata: { lead_id: lead.id },
    });
  }
}

/** The family answered, on the page or by text. The provider hears about it. */
export async function notifyProviderOfReply(db: SupabaseClient, lead: ThreadLead, words: string): Promise<void> {
  const provider = await threadProvider(db, lead);
  if (!provider) return;
  const first = firstWordOf(lead.first_name);
  await notifyProvider(db, lead, provider, {
    sms: `Olera: ${first} replied about their care request. Read & reply:`,
    subject: `${first} replied`,
    headline: `${first} replied`,
    quote: words.slice(0, 400),
    body:
      provider.via === "inbox"
        ? `${first} is the family you took through Olera. Their reply is in your inbox, with everything they told us.`
        : `${first} is one of the families from your ad. Their reply is on your campaign page, with everything else we know about them.`,
    emailType: "city_thread_family_reply_provider",
  });
  await sendSlackAlert(`💬 ${first} replied (city lead ${lead.id.slice(0, 8)}, with ${provider.name}): "${words.slice(0, 200)}"`);
}

/** A family writes back on /f/thread/{token}. */
export async function postFamilyReply(
  db: SupabaseClient,
  lead: ThreadLead,
  body: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const text = body.trim().slice(0, 2000);
  if (!text) return { ok: false, error: "Write a message first.", status: 400 };
  if (lead.archived_at) return { ok: false, error: "This conversation is closed.", status: 409 };
  const { error } = await db.from("city_lead_thread").insert({ lead_id: lead.id, author: "family", body: text });
  if (error) {
    console.error("[city-thread] family reply insert failed", error);
    return { ok: false, error: "Couldn't send that. Try again in a moment.", status: 500 };
  }
  await notifyProviderOfReply(db, lead, text);
  return { ok: true };
}

/**
 * A text to our number from a family already handed to a provider. Returns
 * true when claimed, so the webhook does not also treat it as a care question
 * for the research engine.
 */
export async function relayHandedReply(db: SupabaseClient, phone: string, body: string): Promise<boolean> {
  const { data } = await db
    .from("city_leads")
    .select(LEAD_COLS)
    .eq("phone", phone)
    .eq("is_test", false)
    .is("archived_at", null)
    .not("handed_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);
  const lead = (data?.[0] as ThreadLead | undefined) ?? null;
  if (!lead) return false;
  await notifyProviderOfReply(db, lead, body);
  return true;
}

/**
 * A fresh family has just been put on the provider's campaign page. Only for
 * leads that arrived in the last day: a backlog handed over at deploy is
 * announced by a person, not by a burst of texts.
 */
export async function notifyProviderOfHandover(db: SupabaseClient, lead: ThreadLead): Promise<void> {
  if (Date.now() - new Date(lead.created_at).getTime() > 24 * 60 * 60 * 1000) return;
  const provider = await threadProvider(db, lead);
  if (!provider) return;
  const first = firstWordOf(lead.first_name);
  const replied = !!lead.qualification_reply;
  await notifyProvider(db, lead, provider, {
    sms: `Olera: a new family from your ad, ${first}, is on your campaign page.`,
    subject: `New family from your ad: ${first}`,
    headline: `${first} is looking for care`,
    quote: replied ? lead.qualification_reply : null,
    body: replied
      ? `${first} filled in your form and answered our text. Their number is on your campaign page. A call today is the best next step.`
      : `${first} filled in your form. We have texted them to confirm what they need and have not heard back yet. Their number is on your campaign page if you want to call.`,
    emailType: "city_thread_handover_provider",
  });
}

import { sendSlackAlert, sendSlackDirectMessage } from "@/lib/slack";
import { formatUSPhone } from "@/lib/city-ads/config";
import { getSiteUrl } from "@/lib/site-url";

/**
 * Tell the care team about a new family the moment the lead lands.
 *
 * WHY A MENTION IN #careseeker-support. Ces makes the calls, and she was hearing about Meta
 * leads an hour late: a native lead posted nothing until escalateUnqualified
 * gave up waiting for a reply to the qualifying text, and a website lead only
 * posted to the shared operations channel, where it scrolls past between
 * everything else (meeting 6 Oct). The family filled in the form minutes ago
 * and is still near their phone; that is the call most likely to be answered.
 *
 * Pinging her straight away does not race a provider. Unqualified leads are
 * held from providers until the family answers the qualifying text, so Ces is
 * the first person to ring. A provider's own ad is handed to her when the
 * family answers or after an hour; the message names her so Ces can say so.
 *
 * The mention notifies her as fast as a DM would, and the channel lets anyone
 * covering see that the lead arrived and who is on it (TJ, 6 Oct). The
 * channel is private, so the bot posts there only once someone has typed
 * /invite @Olera v2 Alerts (the bot Cortex posts as) in it; until then the post fails with not_in_channel and the
 * ping falls back to a DM, then to the shared webhook channel.
 *
 * Slack ids are not secrets. The env vars exist so the person on call or the
 * channel can change without a deploy; the defaults are Ces and
 * #careseeker-support.
 */
const DEFAULT_CARE_TEAM_SLACK_USER_ID = "U063P1X0WUE";
const DEFAULT_CARE_TEAM_SLACK_CHANNEL_ID = "C05TN1C48BE";

export type CareTeamPing = {
  city: string;
  timeZone: string;
  firstName: string;
  phone: string;
  /** "Home care for a parent", or null when the form did not ask. */
  need: string | null;
  /**
   * The provider whose own ad this came from. She does not have the family yet:
   * handToPrimary passes it on when they answer our text, or after an hour.
   */
  providerName?: string | null;
  /**
   * A provider-page inquiry: the family wrote to this provider directly, and
   * the provider was told at the same moment as this ping. Ces calls alongside
   * them, not instead of them.
   */
  inquiredWith?: string | null;
  /** When they submitted. Drives the call-time hint. */
  submittedAt: Date;
  seekerId?: string | null;
  source: "Meta form" | "City page" | "Provider page";
};

/**
 * "9:40 PM their time". Ces reached William in the evening after a 2 PM call
 * went unanswered, because the evening was when he had filled in the form. The
 * submit time is the best evidence we have of when they look at their phone.
 */
export function localTimeLabel(at: Date, timeZone: string): string {
  return at.toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
}

export function careTeamPingText(p: CareTeamPing, siteUrl: string): string {
  const link = p.seekerId
    ? `${siteUrl}/admin/relationships/families/${p.seekerId}`
    : `${siteUrl}/admin/relationships/families?tab=call`;
  const who = p.inquiredWith
    ? `They asked ${p.inquiredWith} about care, and ${p.inquiredWith} has been told too. Call to check they're being looked after, and log if ${p.inquiredWith} hasn't reached them.`
    : p.providerName
      ? `From the ${p.providerName} ad. They get this family when it answers our text, or in an hour, so if you reach them first, say ${p.providerName} will be in touch.`
      : "No provider has it yet. You are the first call.";
  return [
    `📞 *New family · ${p.city}* (${p.source})`,
    `${p.firstName} · ${formatUSPhone(p.phone)}${p.need ? ` · ${p.need}` : ""}`,
    `Filled in the form at ${localTimeLabel(p.submittedAt, p.timeZone)} their time. If they do not pick up now, try again around then.`,
    who,
    `<${link}|Open the case>`,
  ].join("\n");
}

/** Never throws. Channel with a mention, else a DM, else the shared webhook channel. */
export async function pingCareTeam(p: CareTeamPing): Promise<void> {
  try {
    const text = careTeamPingText(p, getSiteUrl());
    const userId = process.env.CARE_TEAM_SLACK_USER_ID?.trim() || DEFAULT_CARE_TEAM_SLACK_USER_ID;
    const channelId = process.env.CARE_TEAM_SLACK_CHANNEL_ID?.trim() || DEFAULT_CARE_TEAM_SLACK_CHANNEL_ID;
    // chat.postMessage takes a channel id as readily as a user id; the helper
    // is named for its first use.
    const posted = await sendSlackDirectMessage(channelId, `<@${userId}> ${text}`, { timeoutMs: 5000 });
    if (posted.success) return;
    console.warn("[care-team-ping] channel post failed, falling back to DM:", posted.error);
    const dm = await sendSlackDirectMessage(userId, text, { timeoutMs: 5000 });
    if (!dm.success) await sendSlackAlert(text, undefined, { timeoutMs: 5000 });
  } catch (err) {
    console.error("[care-team-ping] failed", err);
  }
}

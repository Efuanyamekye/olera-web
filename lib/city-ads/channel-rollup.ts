import { classifyCityTraffic } from "./config";

/**
 * Leads and cost per channel, per city.
 *
 * The city arms are a platform experiment before they are a lead source: we do
 * not yet know whether Google, Nextdoor or Meta is the one worth keeping, and
 * Charlotte is about to run all three at once. `city_campaigns` already keeps
 * spend per channel and `city_leads` already records which channel each lead
 * came from, but nothing joined the two — so the one number that decides which
 * platform survives, cost per lead per channel, could only be got by counting
 * rows by hand. This is that join.
 *
 * Spend and clicks are hand-typed into the campaign row from the ad manager
 * (reference_ad_metrics_are_hand_typed); leads are computed. So a channel can
 * legitimately show leads with no cost yet, and the UI must say "spend not
 * typed" rather than print a confident $0.00 cost per lead.
 */

export interface RollupLead {
  slug: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  gclid: string | null;
  fbclid: string | null;
  is_test: boolean | null;
  created_at: string | null;
}

export interface RollupCampaign {
  slug: string;
  channel: string;
  status: string;
  budget_cents: number | null;
  ad_spend_cents: number | null;
  ad_clicks: number | null;
  flight_start: string | null;
  flight_end: string | null;
}

export interface ChannelRow {
  slug: string;
  /** Lower-case channel key, matching city_campaigns.channel. */
  channel: string;
  status: string;
  budgetCents: number | null;
  spendCents: number | null;
  clicks: number | null;
  leads: number;
  /** null when spend has not been typed yet, or no leads — never a fake $0. */
  costPerLeadCents: number | null;
  /** Fraction, null when clicks have not been typed. */
  clickToLead: number | null;
}

/** A lead we cannot attribute to any channel. Counted, never hidden. */
export const UNATTRIBUTED = "unattributed";

/**
 * classifyCityTraffic returns a display name ("Meta"); city_campaigns keys on a
 * lower-case slug ("meta"). One lower-case is the whole mapping, kept here so
 * the two representations cannot drift apart silently.
 *
 * A lead with no channel at all becomes UNATTRIBUTED rather than null. It is a
 * real family who really arrived, and it happens for real reasons — someone
 * typing the URL, a link shared without tags, or an ad platform rewriting the
 * final URL and dropping utm_medium on the way (Google's AI Max URL expansion
 * does exactly that). Dropping those would make this table's lead count
 * disagree with the lead list beside it, which is the confusion the orphan row
 * below exists to prevent.
 */
export function leadChannelKey(lead: RollupLead): string {
  const { channel } = classifyCityTraffic({
    source: lead.utm_source,
    medium: lead.utm_medium,
    gclid: lead.gclid,
    fbclid: lead.fbclid,
  });
  return channel ? channel.toLowerCase() : UNATTRIBUTED;
}

export function buildChannelRollup(campaigns: RollupCampaign[], leads: RollupLead[]): ChannelRow[] {
  // Test rows are TJ's own submissions. Counting them would make a channel look
  // like it produced leads it did not, which is the exact error the flight read
  // must not make.
  const real = leads.filter((l) => l.is_test !== true);

  const counts = new Map<string, number>();
  for (const lead of real) {
    const channel = leadChannelKey(lead);
    if (!lead.slug) continue;
    const key = `${lead.slug}::${channel}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const rows = campaigns.map((c) => {
    const leadCount = counts.get(`${c.slug}::${c.channel}`) ?? 0;
    const spend = c.ad_spend_cents;
    const clicks = c.ad_clicks;
    return {
      slug: c.slug,
      channel: c.channel,
      status: c.status,
      budgetCents: c.budget_cents,
      spendCents: spend,
      clicks,
      leads: leadCount,
      costPerLeadCents: spend != null && leadCount > 0 ? Math.round(spend / leadCount) : null,
      clickToLead: clicks != null && clicks > 0 ? leadCount / clicks : null,
    } satisfies ChannelRow;
  });

  // A lead whose channel has no campaign row — organic, a mistyped utm_medium,
  // or a channel someone launched without adding its row. Surfacing it is the
  // point: silently dropping it would make the totals disagree with the lead
  // list and send us looking for a bug in the wrong place.
  const known = new Set(rows.map((r) => `${r.slug}::${r.channel}`));
  for (const [key, leadCount] of counts) {
    if (known.has(key)) continue;
    const [slug, channel] = key.split("::");
    rows.push({
      slug,
      channel,
      status: "no campaign row",
      budgetCents: null,
      spendCents: null,
      clicks: null,
      leads: leadCount,
      costPerLeadCents: null,
      clickToLead: null,
    });
  }

  return rows.sort((a, b) => a.slug.localeCompare(b.slug) || a.channel.localeCompare(b.channel));
}

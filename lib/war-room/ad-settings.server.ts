/**
 * What a Meta campaign is actually set to right now, and what changed lately.
 *
 * On 2026-09-27 Cortex told the founder to fix Hoop Cares' instant form and to
 * put more money on Meta. Both were already done: the v3 form with a
 * job-seeker option had been live since Sep 24, and the budget went from $10
 * to $20 a day the night before. Cortex read Olera's tables, which hold spend
 * and leads but not the platform's settings, so it re-proposed finished work.
 *
 * This reads the settings from Meta itself (budget, schedule, which ads are on,
 * their copy and form, the form's questions) and the ad account's change
 * history for the campaign, with who made each change. Read-only, with the
 * same META_ADS_ACCESS_TOKEN the Instant Forms panel uses.
 *
 * Google has no equivalent: Olera's Google Ads account has no API access (see
 * app/api/ads/metrics/route.ts), so only the spend and clicks a script posts
 * hourly are known there. Say so rather than guess.
 */

const DEFAULT_GRAPH_VERSION = "v21.0";
const CHANGE_WINDOW_DAYS = 14;
/** Settings carry ad copy and form questions; more than a few crowd out the rest of the answer. */
export const MAX_CAMPAIGNS = 3;

function graphVersion(): string {
  const v = process.env.META_LEADS_GRAPH_VERSION ?? "";
  return /^v\d+\.0$/.test(v) ? v : DEFAULT_GRAPH_VERSION;
}

/** Injected in checks; the real one calls the Graph API. */
export type GraphGet = (path: string, params: Record<string, string>) => Promise<unknown>;

export function graphGet(token: string, timeoutMs = 8_000): GraphGet {
  return async (path, params) => {
    const url = new URL(`https://graph.facebook.com/${graphVersion()}/${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await response.json() as { error?: { message?: string } };
    if (!response.ok || body.error) throw new Error(body.error?.message ?? `Graph ${response.status}`);
    return body;
  };
}

type Geo = { name?: string; region?: string };
type CampaignNode = {
  id: string; name?: string; effective_status?: string; daily_budget?: string; lifetime_budget?: string;
  start_time?: string; stop_time?: string; account_id?: string;
};
type AdSetNode = {
  id: string; name?: string; effective_status?: string; daily_budget?: string; end_time?: string;
  targeting?: { geo_locations?: { cities?: Geo[]; regions?: Geo[]; medium_geo_areas?: Geo[]; zips?: Array<{ name?: string }> } };
};
type CreativeNode = {
  title?: string; body?: string;
  object_story_spec?: { link_data?: { message?: string; name?: string; call_to_action?: { value?: { lead_gen_form_id?: string } } } };
  asset_feed_spec?: {
    bodies?: Array<{ text?: string }>; titles?: Array<{ text?: string }>;
    call_to_actions?: Array<{ value?: { lead_gen_form_id?: string } }>;
  };
};
type AdNode = { id: string; name?: string; effective_status?: string; updated_time?: string; creative?: CreativeNode };
type FormNode = { id: string; name?: string; status?: string; created_time?: string; questions?: Array<{ label?: string; type?: string; options?: Array<{ value?: string }> }> };
type ActivityNode = {
  event_time?: string; translated_event_type?: string; object_id?: string; object_name?: string;
  actor_name?: string; extra_data?: string;
};

const dollars = (cents: string | number | undefined | null) => {
  const n = Number(cents);
  return Number.isFinite(n) && cents !== undefined && cents !== null && cents !== "" ? `$${(n / 100).toFixed(2)}` : null;
};

/** "Campaign budget updated: $10.00 → $20.00 per day". Plain, so the model repeats it plainly. */
export function describeChange(activity: ActivityNode): string {
  const what = activity.translated_event_type ?? "Changed";
  let detail = "";
  try {
    const extra = JSON.parse(activity.extra_data ?? "{}") as Record<string, unknown>;
    const oldValue = extra.old_value as Record<string, unknown> | string | number | undefined;
    const newValue = extra.new_value as Record<string, unknown> | string | number | undefined;
    const pick = (value: typeof oldValue, key: "old_value" | "new_value") => {
      // Targeting changes carry a structured list; the event name says enough.
      if (Array.isArray(value)) return null;
      if (value && typeof value === "object") {
        const inner = value[key];
        return value.type === "payment_amount" ? dollars(inner as number) : (typeof inner === "string" || typeof inner === "number" ? String(inner) : null);
      }
      return value === undefined || value === null ? null : String(value);
    };
    const from = pick(oldValue, "old_value");
    const to = pick(newValue, "new_value");
    const unit = newValue && typeof newValue === "object" && newValue.additional_value ? ` ${String(newValue.additional_value).toLowerCase()}` : "";
    if (from !== null && to !== null) detail = `: ${from} → ${to}${unit}`;
    else if (to !== null) detail = `: ${to}${unit}`;
  } catch {
    // extra_data is not always JSON; the event name alone still says what happened.
  }
  return `${what}${detail}`;
}

function geoNames(adSet: AdSetNode): string[] {
  const geo = adSet.targeting?.geo_locations;
  if (!geo) return [];
  return [
    ...(geo.medium_geo_areas ?? []).map((area) => [area.name, area.region].filter(Boolean).join(", ")),
    ...(geo.cities ?? []).map((city) => [city.name, city.region].filter(Boolean).join(", ")),
    ...(geo.regions ?? []).map((region) => region.name ?? ""),
    ...(geo.zips ?? []).map((zip) => zip.name ?? ""),
  ].filter(Boolean);
}

function adCopy(creative: CreativeNode | undefined) {
  const link = creative?.object_story_spec?.link_data;
  const feed = creative?.asset_feed_spec;
  return {
    headline: link?.name ?? creative?.title ?? feed?.titles?.[0]?.text ?? null,
    text: link?.message ?? creative?.body ?? feed?.bodies?.[0]?.text ?? null,
    formId: link?.call_to_action?.value?.lead_gen_form_id ?? feed?.call_to_actions?.[0]?.value?.lead_gen_form_id ?? null,
  };
}

export type MetaCampaignSettings = Awaited<ReturnType<typeof readOneCampaign>>;

type ActivityLoader = (accountId: string) => Promise<ActivityNode[]>;

/**
 * The change log belongs to the whole ad account, so it is read once per
 * account and shared by every campaign in the answer, inside a time budget.
 * Per campaign it was up to five pages each, and a broad provider name could
 * spend most of the conversation's minute re-reading the same log.
 */
function activityLoader(get: GraphGet, since: number, deadline: number): ActivityLoader {
  const byAccount = new Map<string, Promise<ActivityNode[]>>();
  return (accountId) => {
    let pending = byAccount.get(accountId);
    if (!pending) {
      pending = (async () => {
        // The log is newest first and shared by every campaign in the
        // account. On 2026-09-27 two weeks were 205 entries over three pages,
        // and the first page alone held only 3 of Hoop Cares' 22.
        const all: ActivityNode[] = [];
        let after: string | null = null;
        for (let page = 0; page < 5 && Date.now() < deadline; page += 1) {
          const batch = await get(`act_${accountId}/activities`, {
            fields: "event_time,translated_event_type,object_id,object_name,actor_name,extra_data",
            since: String(Math.floor(since / 1000)),
            limit: "100",
            ...(after ? { after } : {}),
          }) as { data?: ActivityNode[]; paging?: { next?: string; cursors?: { after?: string } } };
          all.push(...(batch.data ?? []));
          after = batch.paging?.next ? batch.paging.cursors?.after ?? null : null;
          if (!after) break;
        }
        return all;
      })();
      byAccount.set(accountId, pending);
    }
    return pending;
  };
}

async function readOneCampaign(get: GraphGet, campaignId: string, activities: ActivityLoader) {
  const [campaign, adSets, ads] = await Promise.all([
    get(campaignId, { fields: "name,effective_status,daily_budget,lifetime_budget,start_time,stop_time,account_id" }) as Promise<CampaignNode>,
    get(`${campaignId}/adsets`, { fields: "name,effective_status,daily_budget,end_time,targeting{geo_locations}", limit: "20" }) as Promise<{ data?: AdSetNode[] }>,
    get(`${campaignId}/ads`, { fields: "name,effective_status,updated_time,creative{title,body,object_story_spec,asset_feed_spec}", limit: "20" }) as Promise<{ data?: AdNode[] }>,
  ]);
  const adRows = (ads.data ?? []).map((ad) => ({ id: ad.id, name: ad.name ?? null, status: ad.effective_status ?? null, lastEdited: ad.updated_time ?? null, ...adCopy(ad.creative) }));

  // The form each running ad sends people to, with its questions: "is there a
  // job-seeker option?" is answered here, not by guessing from the ad name.
  const formIds = [...new Set(adRows.map((ad) => ad.formId).filter((id): id is string => Boolean(id)))];
  const forms = await Promise.all(formIds.map(async (formId) => {
    try {
      const form = await get(formId, { fields: "name,status,created_time,questions" }) as FormNode;
      return {
        id: formId,
        name: form.name ?? null,
        status: form.status ?? null,
        created: form.created_time ?? null,
        questions: (form.questions ?? []).map((question) => ({
          label: question.label ?? question.type ?? null,
          options: (question.options ?? []).map((option) => option.value).filter(Boolean),
        })),
      };
    } catch (error) {
      return { id: formId, unreadable: error instanceof Error ? error.message : "could not read the form" };
    }
  }));

  // Changes in the last two weeks to this campaign, its ad sets or its ads,
  // newest first, with who made them. This is the "already done" evidence.
  const ids = new Set([campaignId, ...(adSets.data ?? []).map((set) => set.id), ...adRows.map((ad) => ad.id)]);
  let recentChanges: Array<{ at: string | null; change: string; on: string | null; by: string | null }> | { unreadable: string } = [];
  if (campaign.account_id) {
    try {
      recentChanges = (await activities(campaign.account_id))
        .filter((activity) => activity.object_id && ids.has(activity.object_id))
        // "Pending process" is Meta's in-between state around every edit: an
        // entry INTO it is noise, the one OUT of it ("→ Inactive", "→ Active")
        // is the real change and stays.
        .filter((activity) => !/"new_value":"Pending (process|Review)"/.test(activity.extra_data ?? "") && !/finishes ad review/i.test(activity.translated_event_type ?? ""))
        .slice(0, 20)
        .map((activity) => ({ at: activity.event_time ?? null, change: describeChange(activity), on: activity.object_name ?? null, by: activity.actor_name ?? null }));
    } catch (error) {
      recentChanges = { unreadable: error instanceof Error ? error.message : "could not read the change history" };
    }
  }

  return {
    campaignId,
    name: campaign.name ?? null,
    status: campaign.effective_status ?? null,
    dailyBudget: dollars(campaign.daily_budget),
    lifetimeBudget: dollars(campaign.lifetime_budget),
    starts: campaign.start_time ?? null,
    ends: campaign.stop_time ?? null,
    adSets: (adSets.data ?? []).map((set) => ({
      name: set.name ?? null,
      status: set.effective_status ?? null,
      dailyBudget: dollars(set.daily_budget),
      ends: set.end_time ?? null,
      locations: geoNames(set),
    })),
    ads: adRows.map(({ id: _id, ...ad }) => ad),
    forms,
    recentChanges,
  };
}

/**
 * Live settings for the named Meta campaigns. Always resolves: a missing token
 * or a refused read comes back as a reason, so Cortex says what it could not
 * see instead of treating silence as "nothing is set".
 */
export async function loadMetaCampaignSettings(
  campaignIds: string[],
  options: { get?: GraphGet; now?: number } = {},
): Promise<{ campaigns: Array<MetaCampaignSettings | { campaignId: string; unreadable: string }> } | { unavailable: string }> {
  const ids = [...new Set(campaignIds.filter((id) => /^\d{6,40}$/.test(id)))].slice(0, MAX_CAMPAIGNS);
  if (!ids.length) return { campaigns: [] };
  const token = process.env.META_ADS_ACCESS_TOKEN?.trim();
  const get = options.get ?? (token ? graphGet(token) : null);
  if (!get) return { unavailable: "Meta's live settings can't be read: META_ADS_ACCESS_TOKEN is not set." };
  const now = options.now ?? Date.now();
  // One budget for every Meta read in this answer, well inside the
  // conversation's own lookup budget.
  const activities = activityLoader(get, now - CHANGE_WINDOW_DAYS * 86_400_000, Date.now() + 12_000);
  const campaigns = await Promise.all(ids.map(async (id) => {
    try {
      return await readOneCampaign(get, id, activities);
    } catch (error) {
      return { campaignId: id, unreadable: error instanceof Error ? error.message : "Meta refused the read" };
    }
  }));
  return { campaigns };
}

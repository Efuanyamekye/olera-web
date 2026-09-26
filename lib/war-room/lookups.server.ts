import type { SupabaseClient } from "@supabase/supabase-js";
import { PROVIDER_EVENT_LABELS } from "@/lib/activity/provider-categories";

/**
 * Cortex's lookups: named, read-only readers over the systems of record.
 *
 * Every "I can't see that" Cortex gave on 2026-09-23 had its answer in a table
 * it was not reading -- who pays, what shipped, who saw the ads nudge, which
 * providers we delivered leads to. Each was first fixed by stuffing one more
 * block into the conversation's context, which only ever covered the
 * questions someone had thought of in advance.
 *
 * This module is the menu instead. The model picks a lookup by name and passes
 * bounded options; it never writes a query. That is the rule the scan's probes
 * already follow (probes.server.ts), for the same reason: each reader is
 * written once, with its joins and id-namespace traps handled inside it, and
 * every count, date comparison and ranking is done here, not by the model --
 * left to the model, all three went wrong repeatedly the same day.
 */

/**
 * The Managed Ads ledger, read live.
 *
 * On 2026-09-23 the founder asked "have any providers subscribed to managed ads
 * in the past week besides Hoop Cares?" Cortex answered from Slack: it said a
 * subscription notification would land in a DM it cannot read, then reported
 * that none of 93 channel messages mentioned one. The answer happened to be
 * right, and the reasoning was wrong: a subscription is a row in
 * `ad_campaign_requests`, not a message. This context carried no product data
 * at all, so the one number the north star counts could only be guessed at from
 * chatter.
 *
 * Small on purpose: every paying provider, and every request, subscription or
 * ending in the last thirty days. Enough to answer "who pays" and "what changed
 * this week" without sending the scan's operating pack.
 */
const LEDGER_WINDOW_DAYS = 30;

export async function loadManagedAdsLedger(db: SupabaseClient, windowDays = LEDGER_WINDOW_DAYS) {
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  const { data, error } = await db.from("ad_campaign_requests")
    .select("display_name, provider_slug, status, plan_status, channel, admin_note, created_at, subscribed_at, ended_at, updated_at")
    .is("deleted_at", null)
    .or(`plan_status.in.(active,past_due),status.in.(requested,pending_profile,live),created_at.gte.${since},subscribed_at.gte.${since},ended_at.gte.${since},and(plan_status.eq.canceled,updated_at.gte.${since})`)
    .order("created_at", { ascending: false })
    .limit(80);
  // A failed read must say so. Returning an empty ledger would read as "nobody
  // pays", which is the confident wrong answer this block exists to replace.
  if (error) return { unavailable: `Could not read the Managed Ads ledger: ${error.message}` };
  type LedgerRow = { display_name: string | null; provider_slug: string | null; status: string; plan_status: string | null; channel: string | null; admin_note: string | null; created_at: string; subscribed_at: string | null; ended_at: string | null; updated_at: string | null };
  // Paying means what the admin revenue chip means: active or past_due. A
  // failed card is still a subscriber until Stripe cancels, and counting only
  // "active" would have Cortex report zero paying providers the day Hoop Cares'
  // card bounced while the admin page still showed one.
  const isPaying = (row: LedgerRow) => row.plan_status === "active" || row.plan_status === "past_due";
  const rows = (data ?? []) as LedgerRow[];
  // The Eastern calendar day, like every other time Cortex sees. Cut from the
  // UTC string, a request made at 9:08 PM ET on Sep 22 read as Sep 23 beside
  // times that said Sep 22.
  const day = (iso: string | null) => (iso ? EASTERN_DAY.format(new Date(iso)) : null);
  // Did the provider ask, or did Olera create the row? A campaign row is not
  // proof of a provider request. On 2026-09-16 three rows were created in the
  // same second at 4 AM Eastern -- TJ's Nextdoor question pilot, drafts Olera
  // set up -- and Cortex reported all day that "three providers requested".
  // A provider request fires `managed_ads_requested` from the form; a row with
  // no such event within a day of its creation was not asked for by them.
  const slugs = rows.map((row) => row.provider_slug).filter((slug): slug is string => Boolean(slug));
  const { data: requestEvents } = slugs.length
    ? await db.from("provider_activity")
      .select("provider_id, created_at")
      .eq("event_type", "managed_ads_requested")
      .in("provider_id", slugs)
      .gte("created_at", new Date(Date.now() - (Math.max(windowDays, 120) + 1) * 86_400_000).toISOString())
    : { data: [] };
  const providerAsked = (row: LedgerRow) => ((requestEvents ?? []) as Array<{ provider_id: string; created_at: string }>)
    .some((event) => event.provider_id === row.provider_slug
      && Math.abs(new Date(event.created_at).getTime() - new Date(row.created_at).getTime()) < 86_400_000);
  // Counted here, not by the model. Given only the rows it said "three
  // providers requested" and then listed four, and called a subscription eight
  // days old "in the past week".
  const within = (iso: string | null, days: number) =>
    Boolean(iso && Date.now() - new Date(iso).getTime() <= days * 86_400_000);
  // Names, not only numbers. With bare counts it still wrote that Hoop Cares
  // subscribed "in the past week" beside a seven-day count of zero; an empty
  // list is harder to talk past than a 0.
  const names = (keep: (row: LedgerRow) => boolean) => rows.filter(keep).map((row) => row.display_name ?? "unnamed");
  const counts = (days: number) => ({
    requestedByTheProvider: names((row) => within(row.created_at, days) && providerAsked(row)),
    createdByOleraWithoutAProviderRequest: names((row) => within(row.created_at, days) && !providerAsked(row)),
    subscribed: names((row) => within(row.subscribed_at, days)),
    ended: names((row) => within(row.ended_at, days)),
    canceled: names((row) => row.plan_status === "canceled" && within(row.updated_at, days)),
  });
  return {
    asOf: new Date().toISOString(),
    windowDays,
    counts: { last7Days: counts(7), [`last${windowDays}Days`]: counts(windowDays) },
    // Every campaign still open, however old. The first version read only the
    // last thirty days, so Franchil's live campaign -- started in August,
    // unpaid -- vanished, and Cortex told the founder she was "not in the
    // subscription list at all" while he was nurturing her toward paying.
    openCampaigns: rows
      .filter((row) => ["requested", "pending_profile", "live"].includes(row.status))
      .map((row) => ({ name: row.display_name, status: row.status, since: day(row.created_at), paying: isPaying(row), providerAsked: providerAsked(row) })),
    payingProviders: rows.filter(isPaying)
      .map((row) => ({ name: row.display_name, subscribedOn: day(row.subscribed_at), planStatus: row.plan_status })),
    recentActivity: rows.map((row) => ({
      name: row.display_name,
      // Plain words, not the raw status. Reading "requested" on the pilot
      // drafts, it told the founder they had "gone live".
      state: ({
        requested: "requested, not live yet",
        pending_profile: "waiting on the provider's profile, not live",
        live: "live",
        ended: "ended",
      } as Record<string, string>)[row.status] ?? row.status,
      paying: isPaying(row),
      planStatus: row.plan_status,
      providerAsked: providerAsked(row),
      channel: row.channel,
      teamNote: row.admin_note ? row.admin_note.slice(0, 200) : null,
      // The webhook stamps no cancellation date; updated_at is the closest.
      canceledAround: row.plan_status === "canceled" ? day(row.updated_at) : null,
      requestedOn: day(row.created_at),
      subscribedOn: day(row.subscribed_at),
      endedOn: day(row.ended_at),
    })),
  };
}

/**
 * What shipped, read live from GitHub.
 *
 * "Do you know the recent work we did on the ads nudge? I think we shipped
 * that yesterday." The written record is a copy refreshed once a day, and that
 * work was written up after the copy. But whether something shipped is not a
 * matter of anyone writing it down: it is a merged pull request. Same lesson as
 * the Managed Ads ledger, a fact with a system of record is read from it.
 *
 * Seven days of merges into staging, and the promotions to main that carried
 * them to production. Titles only; a PR body is not needed to say what shipped.
 */
const SHIPPED_WINDOW_DAYS = 7;

// GitHub logins to the names people use, from docs/MERGE_PERMISSIONS.md. Given
// only "tfalohun" the model called the founder "Tobi". An unmapped login is
// passed through as-is rather than guessed at.
const GITHUB_NAMES: Record<string, string> = {
  tfalohun: "TJ",
  logan447: "Logan",
  Efuanyamekye: "Efua",
  "chantel-stack": "Chantel",
  jakub300: "Jakub",
};

export async function loadRecentlyShipped(windowDays = SHIPPED_WINDOW_DAYS) {
  const token = process.env.WAR_ROOM_GITHUB_TOKEN;
  const repository = process.env.WAR_ROOM_GITHUB_REPOSITORY;
  if (!token || !repository) return { unavailable: "GitHub is not configured for Cortex, so what shipped cannot be read." };
  const since = Date.now() - windowDays * 86_400_000;
  // One budget for the whole read. The Slack route has thirty seconds for
  // everything, and up to ten sequential GitHub calls at eight seconds each
  // could outlast it and leave the founder with no reply at all.
  const deadline = Date.now() + 8_000;
  let partial = false;
  type PullRow = { number: number; title: string; merged_at: string | null; updated_at: string; user: { login: string } | null; head: { ref: string } | null };
  // Paged until the pulls are older than the window. One page of fifty was the
  // first version, and staging takes more than fifty merges a week: it counted
  // Efua's week as nine when GitHub has fourteen.
  const read = async (base: string) => {
    const pulls: PullRow[] = [];
    for (let page = 1; page <= 5; page += 1) {
      const remaining = deadline - Date.now();
      if (remaining < 500) {
        partial = true;
        break;
      }
      const response = await fetch(
        `https://api.github.com/repos/${repository}/pulls?state=closed&base=${base}&sort=updated&direction=desc&per_page=100&page=${page}`,
        {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
          signal: AbortSignal.timeout(remaining),
        },
      );
      if (!response.ok) throw new Error(`GitHub ${response.status}`);
      const batch = (await response.json()) as PullRow[];
      pulls.push(...batch);
      // Sorted by last update, and a merge is an update, so once a page ends
      // before the window nothing later can have merged inside it.
      if (batch.length < 100 || new Date(batch[batch.length - 1].updated_at).getTime() < since) break;
    }
    return pulls
      .filter((pull) => pull.merged_at && new Date(pull.merged_at).getTime() >= since)
      .map((pull) => ({ number: pull.number, title: pull.title, mergedAt: pull.merged_at, author: pull.user?.login ? (GITHUB_NAMES[pull.user.login] ?? pull.user.login) : null, fromBranch: pull.head?.ref ?? null }));
  };
  try {
    const [toStaging, toProduction] = await Promise.all([read("staging"), read("main")]);
    // Worked out here, not by the model. Left to compare timestamps it said
    // #2085 had not reached production when it merged 34 minutes before the
    // promotion that carried it, and counted Efua's week as five, then seven.
    // Promotions are merged from staging, so any staging merge earlier than
    // the newest promotion is live. That holds while main is only ever
    // reached through staging; a hotfix straight to main does not break it.
    const latestPromotion = toProduction
      .filter((pull) => pull.fromBranch === "staging")
      .map((pull) => pull.mergedAt as string)
      .sort()
      .at(-1) ?? null;
    // Which promotion carried each merge: the first one to land after it.
    // Without this, "what went to production today?" named four of the five
    // pulls a promotion carried and credited all of them to one author.
    // Only staging -> main merges carry staging work; a hotfix to main does not.
    const promotions = toProduction.filter((pull) => pull.fromBranch === "staging").sort((a, b) => (a.mergedAt as string).localeCompare(b.mergedAt as string));
    const merged = toStaging.map((pull) => {
      const carrier = promotions.find((promotion) => (promotion.mergedAt as string) > (pull.mergedAt as string));
      return {
        ...pull,
        inProduction: Boolean(carrier),
        reachedProductionIn: carrier ? { promotion: carrier.number, at: carrier.mergedAt } : null,
      };
    });
    // Grouped by person with the count beside the list, so the two cannot
    // disagree. A separate tally and a flat list produced "6" beside nine.
    const byAuthor: Record<string, { count: number; pulls: typeof merged }> = {};
    for (const pull of merged) {
      const key = pull.author ?? "unknown";
      byAuthor[key] ??= { count: 0, pulls: [] };
      byAuthor[key].count += 1;
      byAuthor[key].pulls.push(pull);
    }
    return {
      windowDays,
      ...(partial ? { incomplete: "GitHub was slow and only part of the week was read. Say the list may be missing older merges; do not present counts as complete." } : {}),
      totalMergedToStaging: merged.length,
      latestPromotionToProduction: latestPromotion,
      mergedByAuthor: byAuthor,
      // Each promotion with everything it carried and the count, so "what went
      // live today" is read off one list. Gathering it from per-pull fields,
      // the model said five on two runs and four on the third.
      promotedToProduction: toProduction.map(({ number, title, mergedAt, fromBranch }) => {
        const carried = merged
          .filter((pull) => pull.reachedProductionIn?.promotion === number)
          .map((pull) => ({ number: pull.number, title: pull.title, author: pull.author }));
        return { number, title, mergedAt, isHotfix: fromBranch !== "staging", carriedCount: carried.length, carried };
      }),
    };
  } catch (error) {
    // Said, not swallowed: an empty list would read as "nothing shipped".
    return { unavailable: `Could not read GitHub: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * How providers are engaging with the Managed Ads surfaces, read live.
 *
 * On 2026-09-23, two hours after a new ads nudge went live, the founder asked
 * "any signs of it working? Have providers seen the newer version and engaged
 * with it?" Cortex answered that it had no visibility, which was false: every
 * showing, tap and dismissal of the nudge is a row in `provider_activity`. It
 * simply did not read that table. Third time in a day the same lesson: a fact
 * with a system of record is read from it.
 *
 * Counted in code, per event, as distinct providers with their names. And
 * per release: engagement since each recent promotion went live against the
 * same span one week earlier, so "is it working" compares like with like --
 * same weekday, same hours -- instead of this afternoon against a whole week.
 */
const ADS_EVENTS = [
  "ads_touchpoint_viewed",
  "ads_touchpoint_clicked",
  "ads_touchpoint_dismissed",
  "managed_ads_pitch_viewed",
  "managed_ads_cta_clicked",
  "managed_ads_boost_viewed",
  "managed_ads_requested",
  "managed_ads_not_now",
] as const;
const ENGAGEMENT_ROW_CAP = 10_000;

export type PromotionTime = { number: number; title: string; mergedAt: string | null; carried?: Array<{ title: string }> };

export async function loadAdsEngagement(db: SupabaseClient, promotions: PromotionTime[]) {
  const now = Date.now();
  const since = new Date(now - 21 * 86_400_000).toISOString();
  const [{ data, error }, deletedResult] = await Promise.all([
    db.from("provider_activity")
      .select("provider_id, event_type, created_at, metadata")
      .in("event_type", ADS_EVENTS as unknown as string[])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(ENGAGEMENT_ROW_CAP),
    // A request event is written when the form submits; the campaign row can
    // be deleted minutes later. On 2026-09-23 Aggie Home Care's request was
    // deleted four minutes after it was made, and Cortex offered it as the one
    // sign the new nudge was working.
    db.from("ad_campaign_requests")
      .select("provider_slug, created_at")
      .not("deleted_at", "is", null)
      .gte("created_at", since),
  ]);
  if (error) return { unavailable: `Could not read provider engagement: ${error.message}` };
  const deletedRequests = (deletedResult.data ?? []) as Array<{ provider_slug: string | null; created_at: string }>;
  const requestWasDeleted = (row: { provider_id: string | null; created_at: string }) =>
    deletedRequests.some((request) =>
      request.provider_slug === row.provider_id
      && Math.abs(new Date(request.created_at).getTime() - new Date(row.created_at).getTime()) < 10 * 60_000);
  type Row = { provider_id: string | null; event_type: string; created_at: string; metadata: Record<string, unknown> | null };
  const nameOf = (row: Row) => String(row.metadata?.provider_name ?? row.provider_id ?? "unknown");
  // Test profiles are the team clicking through its own work. On 2026-09-22
  // the only showing of the nudge after 21:00 UTC was "(Test) Effy's Homecare".
  const rows = ((data ?? []) as Row[]).filter((row) =>
    !(row.provider_id ?? "").startsWith("test-") && !nameOf(row).startsWith("(Test)"));

  const summarize = (from: number, to: number) => {
    const inWindow = rows.filter((row) => {
      const at = new Date(row.created_at).getTime();
      return at >= from && at < to;
    });
    const byEvent: Record<string, { providers: number; names: string[]; events: number }> = {};
    const withdrawn = [...new Set(inWindow
      .filter((row) => row.event_type === "managed_ads_requested" && requestWasDeleted(row))
      .map(nameOf))];
    for (const eventType of ADS_EVENTS) {
      const hits = inWindow.filter((row) => row.event_type === eventType
        && !(eventType === "managed_ads_requested" && requestWasDeleted(row)));
      const names = [...new Set(hits.map(nameOf))];
      if (hits.length) byEvent[PROVIDER_EVENT_LABELS[eventType] ?? eventType] = { providers: names.length, names: names.slice(0, 15), events: hits.length };
    }
    // Which placement showed the nudge: a new placement and an old one read
    // very differently.
    const shownBy: Record<string, number> = {};
    for (const row of inWindow.filter((r) => r.event_type === "ads_touchpoint_viewed")) {
      const placement = String(row.metadata?.touchpoint ?? "unknown");
      shownBy[placement] = (shownBy[placement] ?? 0) + 1;
    }
    return {
      byEvent,
      ...(withdrawn.length ? { requestsLaterDeleted: withdrawn } : {}),
      nudgeShowingsByPlacement: shownBy,
      anyActivity: inWindow.length > 0,
    };
  };

  const recent = promotions
    .filter((promotion) => promotion.mergedAt)
    .sort((a, b) => (b.mergedAt as string).localeCompare(a.mergedAt as string))
    .slice(0, 3)
    .map((promotion) => {
      const at = new Date(promotion.mergedAt as string).getTime();
      return {
        promotion: promotion.number,
        title: promotion.title,
        // What it carried, so the right release is judged. Given titles only,
        // Cortex dated the ads nudge from a later Cortex-only promotion.
        carried: (promotion.carried ?? []).map((pull) => pull.title),
        liveSince: promotion.mergedAt,
        hoursLive: Math.round((now - at) / 3_600_000),
        sinceItWentLive: summarize(at, now),
        sameHoursOneWeekEarlier: summarize(at - 7 * 86_400_000, now - 7 * 86_400_000),
      };
    });

  // Direction worked out here. Given both weeks side by side, the model wrote
  // that page views "rose from 12 providers to 9".
  const thisWeek = summarize(now - 7 * 86_400_000, now);
  const lastWeek = summarize(now - 14 * 86_400_000, now - 7 * 86_400_000);
  const weekOverWeek = Object.fromEntries(
    [...new Set([...Object.keys(thisWeek.byEvent), ...Object.keys(lastWeek.byEvent)])].map((label) => {
      const current = thisWeek.byEvent[label]?.providers ?? 0;
      const prior = lastWeek.byEvent[label]?.providers ?? 0;
      return [label, {
        providersThisWeek: current,
        providersLastWeek: prior,
        direction: current > prior ? "up" : current < prior ? "down" : "flat",
      }];
    }),
  );
  return {
    ...(rows.length >= ENGAGEMENT_ROW_CAP ? { incomplete: "Hit the row cap; older activity may be missing." } : {}),
    testProfilesExcluded: true,
    latestActivity: rows[0]?.created_at ?? null,
    weekOverWeek,
    last7Days: thisWeek,
    previous7Days: lastWeek,
    sinceEachRecentRelease: recent,
    note: "Providers mostly use the product in US business hours. A release that has only been live overnight Eastern has had almost no chance to be seen; say so rather than reading silence as failure.",
  };
}

/**
 * Every timestamp in the record, rendered in US Eastern before the model sees
 * it. The business runs on Eastern and the admin pages already do; the model
 * was left to convert UTC itself and told the founder "yesterday is not quite
 * right" about a merge that was yesterday evening in the US and this morning
 * in Bangkok. It never does time-zone arithmetic now.
 */
const EASTERN = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
});
export const BANGKOK = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Bangkok", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
});
const EASTERN_DAY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

export function inEastern(value: unknown): unknown {
  if (typeof value === "string" && ISO_DATETIME.test(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : `${EASTERN.format(date)} ET`;
  }
  if (Array.isArray(value)) return value.map(inEastern);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, inEastern(inner)]));
  }
  return value;
}


/**
 * Providers, ranked the way the founder ranks them.
 *
 * TJ, 2026-09-23, asking who to nurture toward subscribing after Franchil:
 * "Engagement and reply is definitely a priority because we can give somebody
 * leads who currently doesn't have some, but it's much harder to make a
 * provider engage even if we have leads." So engagement tiers first, leads
 * second. Ranked by leads alone, the top of the list was senior apartment
 * buildings that will never buy Managed Ads.
 *
 * Every signal reuses the definition the product already has, so Cortex cannot
 * drift from the admin pages:
 * - replied to a family: a real message in `connections.metadata.thread` from
 *   the provider (not auto, not system, has text), or a confirmation -- the
 *   rule in app/api/admin/connections.
 * - replied to Olera: an inbound `provider_touches` row, or an inbound email or
 *   text still awaiting our reply (the relationship view's `awaiting_reply`).
 * - active in the product: days with a meaningful action, canonicalized to the
 *   business profile (lib/admin-provider-activity).
 * All keyed on business_profiles.id.
 */
type ProviderSignals = {
  leads: number;
  repliedToFamilies: number;
  repliedToUs: number;
  lastRepliedToUs: string | null;
  activeDays: number;
  lastActive: string | null;
};

const ENGAGEMENT_TIERS = [
  "replied to Olera",
  "replied to families",
  "active in the product",
  "no engagement yet",
] as const;

export async function loadProviders(
  db: SupabaseClient,
  options: { name?: string; windowDays: number; limit: number; adsFitOnly?: boolean },
) {
  const now = new Date();
  const since = new Date(now.getTime() - options.windowDays * 86_400_000).toISOString();
  const [{ fetchMeaningfulProviderActivity, canonicalizeMeaningfulProviderActivity }, { loadRelationships }] = await Promise.all([
    import("@/lib/admin-provider-activity"),
    import("@/lib/touches/timeline.server"),
  ]);

  const [inquiries, inbound, activityRaw, relationships, campaigns] = await Promise.all([
    db.from("connections")
      .select("to_profile_id, created_at, metadata")
      .eq("type", "inquiry")
      .gte("created_at", since)
      .not("metadata", "cs", JSON.stringify({ archived: true }))
      .limit(10_000),
    db.from("provider_touches")
      .select("provider_id, occurred_at")
      .eq("direction", "in")
      .gte("occurred_at", since),
    fetchMeaningfulProviderActivity(db, since, now.toISOString()),
    loadRelationships().catch(() => []),
    db.from("ad_campaign_requests")
      .select("provider_id, status, plan_status, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);
  if (inquiries.error) return { unavailable: `Could not read inquiries: ${inquiries.error.message}` };

  const signals = new Map<string, ProviderSignals>();
  const get = (id: string) => {
    let row = signals.get(id);
    if (!row) {
      row = { leads: 0, repliedToFamilies: 0, repliedToUs: 0, lastRepliedToUs: null, activeDays: 0, lastActive: null };
      signals.set(id, row);
    }
    return row;
  };

  type Thread = Array<{ from_profile_id?: string; text?: string; is_auto_reply?: boolean; type?: string }>;
  for (const row of (inquiries.data ?? []) as Array<{ to_profile_id: string | null; metadata: Record<string, unknown> | null }>) {
    if (!row.to_profile_id) continue;
    const entry = get(row.to_profile_id);
    entry.leads += 1;
    const meta = row.metadata ?? {};
    const thread = (Array.isArray(meta.thread) ? meta.thread : []) as Thread;
    const replied = thread.some((message) =>
      message.from_profile_id === row.to_profile_id && message.is_auto_reply !== true && message.type !== "system" && Boolean(message.text?.trim()));
    if (replied || meta.provider_confirmed === true || meta.family_confirmed === true) entry.repliedToFamilies += 1;
  }

  for (const touch of (inbound.data ?? []) as Array<{ provider_id: string; occurred_at: string }>) {
    const entry = get(touch.provider_id);
    entry.repliedToUs += 1;
    if (!entry.lastRepliedToUs || touch.occurred_at > entry.lastRepliedToUs) entry.lastRepliedToUs = touch.occurred_at;
  }

  const relationshipById = new Map(relationships.map((row) => [row.provider_id, row]));
  for (const row of relationships) {
    // An email or text the provider sent through support@ is a reply to Olera
    // too. Counting only logged touches and unanswered mail missed Liz at Hoop
    // Cares, who emailed her owner photo and got a reply.
    const inboundAt = row.last_inbound_from_provider_at;
    if (inboundAt && inboundAt >= since) {
      const entry = get(row.provider_id);
      entry.repliedToUs = Math.max(entry.repliedToUs, 1);
      if (!entry.lastRepliedToUs || inboundAt > entry.lastRepliedToUs) entry.lastRepliedToUs = inboundAt;
    }
  }

  if (!activityRaw.error) {
    const canonical = await canonicalizeMeaningfulProviderActivity(db, activityRaw.data);
    const days = new Map<string, Set<string>>();
    for (const event of canonical.data) {
      const set = days.get(event.providerId) ?? new Set<string>();
      set.add(event.createdAt.slice(0, 10));
      days.set(event.providerId, set);
      const entry = get(event.providerId);
      if (!entry.lastActive || event.createdAt > entry.lastActive) entry.lastActive = event.createdAt;
    }
    for (const [id, set] of days) get(id).activeDays = set.size;
  }

  const campaignById = new Map<string, { status: string; paying: boolean }>();
  for (const row of (campaigns.data ?? []) as Array<{ provider_id: string | null; status: string; plan_status: string | null }>) {
    if (row.provider_id && !campaignById.has(row.provider_id)) {
      campaignById.set(row.provider_id, { status: row.status, paying: row.plan_status === "active" || row.plan_status === "past_due" });
    }
  }

  // Fit is read from who has actually had a Managed Ads campaign, not from a
  // rule written here. The product's own eligibility gate is profile
  // completeness, which says nothing about what kind of business buys ads, and
  // ranked by replies alone the list filled with senior apartment buildings.
  for (const id of campaignById.keys()) if (!signals.has(id)) get(id);
  const ids = [...signals.keys()];
  const profiles = new Map<string, { display_name: string | null; category: string | null; city: string | null; state: string | null; claimed: boolean }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from("business_profiles")
      .select("id, display_name, category, city, state, account_id, type")
      .in("id", ids.slice(i, i + 200));
    for (const row of (data ?? []) as Array<{ id: string; display_name: string | null; category: string | null; city: string | null; state: string | null; account_id: string | null; type: string | null }>) {
      // Families have business_profiles too; only providers belong here.
      if (row.type !== "organization") continue;
      profiles.set(row.id, { display_name: row.display_name, category: row.category, city: row.city, state: row.state, claimed: Boolean(row.account_id) });
    }
  }

  const normalize = (category: string | null) => (category ?? "").toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "");
  const adsCategories = new Set(
    [...campaignById.keys()].map((id) => normalize(profiles.get(id)?.category ?? null)).filter(Boolean),
  );
  const tierOf = (entry: ProviderSignals) =>
    entry.repliedToUs > 0 ? 0 : entry.repliedToFamilies > 0 ? 1 : entry.activeDays >= 2 ? 2 : 3;
  const needle = options.name?.trim().toLowerCase();
  const ranked = ids
    .filter((id) => profiles.has(id))
    .filter((id) => !needle || (profiles.get(id)?.display_name ?? "").toLowerCase().includes(needle))
    .filter((id) => !options.adsFitOnly || adsCategories.has(normalize(profiles.get(id)?.category ?? null)))
    .map((id) => {
      const entry = signals.get(id) as ProviderSignals;
      const profile = profiles.get(id)!;
      const campaign = campaignById.get(id);
      const relationship = relationshipById.get(id);
      return {
        id,
        tier: tierOf(entry),
        row: {
          name: profile.display_name,
          place: [profile.city, profile.state].filter(Boolean).join(", ") || null,
          category: profile.category,
          claimed: profile.claimed,
          engagement: ENGAGEMENT_TIERS[tierOf(entry)],
          repliedToOlera: entry.repliedToUs,
          lastRepliedToOlera: entry.lastRepliedToUs,
          familyInquiriesDelivered: entry.leads,
          familiesRepliedTo: entry.repliedToFamilies,
          daysActiveInProduct: entry.activeDays,
          lastActiveInProduct: entry.lastActive,
          managedAds: campaign ? `${campaign.status}${campaign.paying ? ", paying" : ", not paying"}` : "no campaign",
          lastHumanContactEitherWay: relationship?.last_human_touch_at ?? null,
          openFollowUp: relationship?.open_action ?? null,
        },
        leads: entry.leads,
        recency: entry.lastRepliedToUs ?? entry.lastActive ?? "",
      };
    })
    // The founder's order: engagement tier, then leads, then most recent.
    .sort((a, b) => a.tier - b.tier || b.leads - a.leads || b.recency.localeCompare(a.recency));

  return {
    windowDays: options.windowDays,
    rankedBy: "engagement first (replied to Olera, then replied to families, then active in the product), then family inquiries delivered, then most recent activity",
    providersConsidered: ranked.length,
    ...(options.adsFitOnly ? { filteredTo: `categories that have had a Managed Ads campaign: ${[...adsCategories].join(", ")}` } : {}),
    ...(activityRaw.truncated ? { incomplete: "Product activity hit its row cap; active-day counts may be low." } : {}),
    providers: ranked.slice(0, options.limit).map((entry, index) => ({ rank: index + 1, ...entry.row })),
  };
}

// ---------------------------------------------------------------------------
// The menu.
// ---------------------------------------------------------------------------

/**
 * What Cortex asked for and could not get.
 *
 * The scan already has this signal -- a probe choice of "none" with the
 * question it wanted answered -- and nothing ever read it: the brief skipped
 * it. A lookup that does not exist is only fixed if someone sees that it was
 * needed. Stored as a bounded list in source state; the brief surfaces it.
 */
const GAP_STATE_KEY = "cortex_lookup_gaps";
const MAX_GAPS = 40;

export type LookupGap = { at: string; question: string; needed: string };

export async function recordLookupGap(db: SupabaseClient, gap: Omit<LookupGap, "at">): Promise<void> {
  const { data } = await db.from("war_room_source_state").select("metadata").eq("source_key", GAP_STATE_KEY).maybeSingle();
  const existing = ((data?.metadata as { gaps?: LookupGap[] } | null)?.gaps ?? []);
  const gaps = [{ at: new Date().toISOString(), question: gap.question.slice(0, 300), needed: gap.needed.slice(0, 300) }, ...existing].slice(0, MAX_GAPS);
  await db.from("war_room_source_state").upsert({
    source_key: GAP_STATE_KEY,
    last_synced_at: new Date().toISOString(),
    last_success_at: new Date().toISOString(),
    last_error: null,
    metadata: { gaps },
    updated_at: new Date().toISOString(),
  }, { onConflict: "source_key" }).then(() => undefined, () => undefined);
}

export async function loadLookupGaps(db: SupabaseClient, sinceIso: string): Promise<LookupGap[]> {
  const { data } = await db.from("war_room_source_state").select("metadata").eq("source_key", GAP_STATE_KEY).maybeSingle();
  return ((data?.metadata as { gaps?: LookupGap[] } | null)?.gaps ?? []).filter((gap) => gap.at >= sinceIso);
}

const clampDays = (value: unknown, fallback: number, min: number, max: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
};

/**
 * Care seekers who published their needs to providers in their city.
 *
 * Families can opt to publish a care post (metadata.care_post on their
 * profile). On 2026-09-26 the founder asked Cortex about using these to tell
 * providers "families near you are looking for care", and Cortex answered that
 * nobody had built a published-profile system: there was no lookup, so it could
 * not see the 224 active posts. Aggregates only; no names or contact details.
 */
async function loadPublishedCareNeeds(db: SupabaseClient, options: { days: number; city?: string; state?: string }) {
  let request = db.from("business_profiles")
    .select("city, state, care_types, metadata")
    .eq("type", "family")
    .eq("metadata->care_post->>status", "active")
    .limit(2_000);
  if (options.state) request = request.ilike("state", options.state.trim());
  if (options.city) request = request.ilike("city", options.city.trim());
  const { data, error } = await request;
  if (error) throw new Error(error.message);
  const since = new Date(Date.now() - options.days * 86_400_000).toISOString();
  const rows = (data ?? []) as Array<{ city: string | null; state: string | null; care_types: string[] | null; metadata: { care_post?: { published_at?: string } } | null }>;
  const recent = rows.filter((row) => (row.metadata?.care_post?.published_at ?? "") >= since);
  const tally = (list: typeof rows, key: (row: (typeof rows)[number]) => string[]) => {
    const counts = new Map<string, number>();
    for (const row of list) for (const value of key(row)) counts.set(value, (counts.get(value) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([name, count]) => ({ name, count }));
  };
  return {
    activePosts: rows.length,
    publishedInWindow: recent.length,
    windowDays: options.days,
    topCities: tally(rows, (row) => (row.city && row.state ? [`${row.city}, ${row.state}`] : [])),
    topCitiesInWindow: tally(recent, (row) => (row.city && row.state ? [`${row.city}, ${row.state}`] : [])),
    careTypes: tally(rows, (row) => row.care_types ?? []),
    note: "Families who chose to publish their care needs to providers in their area. Counts only.",
  };
}

/**
 * Everything running for one provider, and the leads it produced.
 *
 * On 2026-09-26 Cortex told the founder Hoop Cares had "no Meta arm on record"
 * and "zero inquiries". Both were wrong: her Meta instant form lives in
 * city_campaigns (linked to her Ad Boost campaign by request_id) and its seven
 * leads live in city_leads. Cortex read only the Ad Boost row's team note and
 * the site's inquiry table. Counts only; no family names or contact details.
 */
async function loadProviderCampaigns(db: SupabaseClient, name: string) {
  const term = name.replace(/[%,()]/g, " ").trim();
  if (!term) return { unavailable: "Name a provider." };
  const { data: requests, error } = await db.from("ad_campaign_requests")
    .select("id, provider_id, display_name, status, channel, campaign_tag, plan_status, plan_value, subscribed_at, flight_start_date, flight_end_date, ad_spend_cents, ad_clicks, ad_impressions, metrics_updated_at, provider_reported_outcome, ended_at, ended_reason, admin_note")
    .ilike("display_name", `%${term}%`)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message);
  const rows = (requests ?? []) as Array<Record<string, unknown> & { id: string; provider_id: string | null }>;
  if (!rows.length) return { found: false, note: `No Ad Boost campaign matches "${term}".` };

  const requestIds = rows.map((row) => row.id);
  const providerIds = [...new Set(rows.map((row) => row.provider_id).filter((id): id is string => Boolean(id)))];
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [cityResult, inquiryResult] = await Promise.all([
    db.from("city_campaigns")
      .select("slug, city, state, ring_label, channel, campaign_tag, status, flight_start, flight_end, ad_spend_cents, ad_clicks, ad_impressions, admin_note, request_id")
      .in("request_id", requestIds),
    providerIds.length
      ? db.from("connections").select("to_profile_id", { count: "exact", head: true }).eq("type", "inquiry").in("to_profile_id", providerIds).gte("created_at", since)
      : Promise.resolve({ count: 0, error: null }),
  ]);
  const cityCampaigns = (cityResult.data ?? []) as Array<Record<string, unknown> & { slug: string }>;
  const slugs = cityCampaigns.map((campaign) => campaign.slug);
  const { data: leadRows } = slugs.length
    ? await db.from("city_leads")
      // Archived leads count: a lead qualified out as a job-seeker is archived,
      // and dropping those turned Hoop Cares' 7 leads into 1.
      .select("slug, status, qualification_verdict_category, handed_at, created_at, archived_at")
      .in("slug", slugs)
      .or("is_test.is.null,is_test.eq.false")
    : { data: [] };
  const leadsBySlug = new Map<string, { total: number; archived: number; handedToProvider: number; byStatus: Record<string, number>; byQualification: Record<string, number>; latest: string | null }>();
  for (const lead of (leadRows ?? []) as Array<{ slug: string; status: string | null; qualification_verdict_category: string | null; handed_at: string | null; created_at: string; archived_at: string | null }>) {
    const entry = leadsBySlug.get(lead.slug) ?? { total: 0, archived: 0, handedToProvider: 0, byStatus: {}, byQualification: {}, latest: null };
    entry.total += 1;
    if (lead.archived_at) entry.archived += 1;
    if (lead.handed_at) entry.handedToProvider += 1;
    const status = lead.status ?? "unknown";
    entry.byStatus[status] = (entry.byStatus[status] ?? 0) + 1;
    const verdict = lead.qualification_verdict_category ?? "not yet qualified";
    entry.byQualification[verdict] = (entry.byQualification[verdict] ?? 0) + 1;
    if (!entry.latest || lead.created_at > entry.latest) entry.latest = lead.created_at;
    leadsBySlug.set(lead.slug, entry);
  }

  return {
    note: "Live campaign and lead tables. These outrank team notes, which go out of date. 'Site inquiries' are families contacting the provider on Olera; ad leads come from the campaigns below and are counted separately. In each campaign's leads, 'archived' leads were already removed from the provider's queue by the team or the classifier: never recommend pulling them out again.",
    campaigns: rows.map((row) => ({
      ...row,
      linkedAdCampaigns: cityCampaigns
        .filter((campaign) => campaign.request_id === row.id)
        .map(({ request_id: _unused, ...campaign }) => ({ ...campaign, leads: leadsBySlug.get(campaign.slug) ?? { total: 0 } })),
    })),
    siteInquiriesLast30Days: inquiryResult.error ? null : inquiryResult.count ?? 0,
  };
}

/** Tool definitions, in the shape the Messages API takes. */
export const LOOKUP_TOOLS = [
  {
    name: "managed_ads_subscriptions",
    description: "Live Managed Ads ledger: who pays (active or past due), every open campaign however old, and requests, subscriptions, endings and cancellations in a window, with whether the provider asked or Olera created it (e.g. a pilot) and the team's note. Use for who pays, who subscribed, who requested, what is live, what ended.",
    input_schema: {
      type: "object" as const,
      properties: { window_days: { type: "integer", minimum: 7, maximum: 365, description: "Look-back window. Default 30." } },
      additionalProperties: false,
    },
  },
  {
    name: "shipped_work",
    description: "Live from GitHub: pull requests merged to staging in a window, with author names, whether each reached production and which promotion carried it, per-person counts, and each promotion's full contents. Use for what was built, shipped, merged or deployed, and by whom.",
    input_schema: {
      type: "object" as const,
      properties: { window_days: { type: "integer", minimum: 1, maximum: 30, description: "Look-back window. Default 7." } },
      additionalProperties: false,
    },
  },
  {
    name: "ads_engagement",
    description: "Live product analytics for the Managed Ads nudge and pitch: providers shown, tapped, dismissed, page views, requests (withdrawn ones excluded), week over week with direction, and each recent release against the same hours a week earlier. Test profiles excluded. Use for whether providers saw or used something and whether a change is working.",
    input_schema: { type: "object" as const, properties: {}, additionalProperties: false },
  },
  {
    name: "providers",
    description: "Providers ranked the founder's way: engagement first (replied to Olera, then replied to families, then active in the product), then family inquiries delivered. Each row has leads delivered, replies to families and to Olera, days active, Managed Ads status, last human contact, open follow-up, category and whether claimed. Use for who to follow up with, who to nurture toward subscribing, who got the most leads, or everything about one provider (pass name).",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Part of a provider's name, to look at one provider." },
        window_days: { type: "integer", minimum: 30, maximum: 365, description: "Look-back window. Default 90." },
        ads_fit_only: { type: "boolean", description: "Only categories of business that have had a Managed Ads campaign. Set true for any question about who to sell or nurture Managed Ads to." },
        limit: { type: "integer", minimum: 1, maximum: 25, description: "How many to return. Default 10." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "provider_campaigns",
    description: "Everything running for one provider and what it produced, read live: their Ad Boost campaign (plan, flight dates, spend, clicks), every linked ad campaign including Meta instant forms and city campaigns, the leads each one produced (qualified or not, handed to the provider), and site inquiries in the last 30 days. Use for what ads a provider has, which channels, when a flight ends, and how many leads they got. Outranks team notes.",
    input_schema: {
      type: "object" as const,
      properties: { name: { type: "string", description: "Part of the provider's name, e.g. Hoop Cares." } },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "published_care_needs",
    description: "Families who published their care needs to providers in their city (Olera's published care posts): how many are active, how many were published in a window, the top cities and care types. Counts only, no names. Use for questions about published profiles, care posts, or local family demand a provider could be told about.",
    input_schema: {
      type: "object" as const,
      properties: {
        days: { type: "integer", minimum: 7, maximum: 365, description: "Look-back window for recently published. Default 30." },
        city: { type: "string", description: "Only this city." },
        state: { type: "string", description: "Only this state, two letters." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "support_inbox",
    description: "The support@olera.care inbox, read from the support inbox's own tables: each thread's subject, who it is from (matched provider or family), category, priority, whether it was handled, when, and the inbox's one-line summary. No message bodies. Use for whether anyone emailed, what a provider said, or what is waiting on a reply. It is the only inbox Cortex can read.",
    input_schema: {
      type: "object" as const,
      properties: {
        days: { type: "integer", minimum: 1, maximum: 30, description: "Look-back window. Default 7." },
        category: { type: "string", enum: ["provider", "partner", "care_seeker", "legal", "security", "other"], description: "Only this category." },
        query: { type: "string", description: "Part of a name, business or subject." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "scan_probe",
    description: "Run one of the daily scan's read-only investigation probes: question_to_claim_conversion (does question volume drive claims), question_inventory_health (is the question inventory usable demand), provider_contactability (can Olera reach providers holding questions), traffic_by_page_family (which page family gained or lost organic reach), revenue_by_product (where the Ad Boost revenue funnel stops), support_backlog_composition (what is in the support backlog). Slower than the others.",
    input_schema: {
      type: "object" as const,
      properties: {
        probe: {
          type: "string",
          enum: ["question_to_claim_conversion", "question_inventory_health", "provider_contactability", "traffic_by_page_family", "revenue_by_product", "support_backlog_composition"],
        },
      },
      required: ["probe"],
      additionalProperties: false,
    },
  },
  {
    name: "search_record",
    description: "Search the stored copy of Slack channel messages and Olera's written record (SCRATCHPAD, docs), ranked by how many of your words each item matches. Try more than one phrasing when the first misses: partial or alternative names, the channel's topic words, the subject. Optional channel and author hints (any part of a name). Authors are only recorded on newer Slack messages.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Words to look for: subject, names, distinctive terms." },
        channel: { type: "string", description: "Part of a channel name or topic, e.g. 'care nav' or 'study'." },
        author: { type: "string", description: "Any part of the author's name." },
        days: { type: "integer", minimum: 1, maximum: 365, description: "Only the last N days." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "read_document",
    description: "Read the full text of a document someone shared in Slack (Word, PDF, text), found by part of its file name, channel or sharer. Use when asked to summarize or explain a shared file; search_record only returns short excerpts.",
    input_schema: {
      type: "object" as const,
      properties: { query: { type: "string", description: "Part of the file name, channel, or who shared it." } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "nothing_fits",
    description: "Only for questions about Olera's own data. Call this when no lookup can answer such a question, before telling the founder you cannot see something. Never call it for questions about the outside world; use web search for those. Record what data would have answered it. It is shown to the founder as a list of lookups worth building.",
    input_schema: {
      type: "object" as const,
      properties: {
        question: { type: "string", description: "The question, in a sentence." },
        needed: { type: "string", description: "What data, from where, would answer it." },
      },
      required: ["question", "needed"],
      additionalProperties: false,
    },
  },
];

/** Runs one lookup. Always resolves: a failure is returned as data, so the model says it could not read it. */
export async function runLookup(db: SupabaseClient, name: string, input: Record<string, unknown>): Promise<unknown> {
  try {
    switch (name) {
      case "managed_ads_subscriptions":
        return inEastern(await loadManagedAdsLedger(db, clampDays(input.window_days, LEDGER_WINDOW_DAYS, 7, 365)));
      case "shipped_work":
        return inEastern(await loadRecentlyShipped(clampDays(input.window_days, SHIPPED_WINDOW_DAYS, 1, 30)));
      case "ads_engagement": {
        // Needs the promotion times, so it reads GitHub first.
        const shipped = await loadRecentlyShipped();
        const promotions = "promotedToProduction" in shipped ? (shipped.promotedToProduction as PromotionTime[]) : [];
        return inEastern(await loadAdsEngagement(db, promotions));
      }
      case "providers":
        return inEastern(await loadProviders(db, {
          name: typeof input.name === "string" ? input.name : undefined,
          windowDays: clampDays(input.window_days, 90, 30, 365),
          limit: clampDays(input.limit, 10, 1, 25),
          adsFitOnly: input.ads_fit_only === true,
        }));
      case "provider_campaigns":
        return inEastern(await loadProviderCampaigns(db, String(input.name ?? "")));
      case "published_care_needs":
        return inEastern(await loadPublishedCareNeeds(db, {
          days: clampDays(input.days, 30, 7, 365),
          city: typeof input.city === "string" ? input.city : undefined,
          state: typeof input.state === "string" ? input.state : undefined,
        }));
      case "support_inbox": {
        const { loadSupportInbox } = await import("@/lib/war-room/provider-moments.server");
        return inEastern(await loadSupportInbox(db, {
          days: clampDays(input.days, 7, 1, 30),
          category: typeof input.category === "string" ? input.category : undefined,
          query: typeof input.query === "string" ? input.query : undefined,
        }));
      }
      case "scan_probe": {
        const { isWarRoomProbeId, runWarRoomProbe } = await import("@/lib/war-room/probes.server");
        if (!isWarRoomProbeId(input.probe) || input.probe === "none") return { unavailable: "No such probe." };
        return inEastern(await runWarRoomProbe(db, input.probe));
      }
      case "search_record":
        return inEastern(await searchStoredRecord(db, {
          query: String(input.query ?? ""),
          channel: typeof input.channel === "string" ? input.channel : undefined,
          author: typeof input.author === "string" ? input.author : undefined,
          days: typeof input.days === "number" ? clampDays(input.days, 30, 1, 365) : undefined,
        }));
      case "read_document":
        return inEastern(await readSharedDocument(db, String(input.query ?? "")));
      case "nothing_fits":
        await recordLookupGap(db, { question: String(input.question ?? ""), needed: String(input.needed ?? "") });
        return { recorded: true, note: "Tell the founder plainly what you could not see and that it has been noted as a lookup to build." };
      default:
        return { unavailable: `No lookup named ${name}.` };
    }
  } catch (error) {
    return { unavailable: `The ${name} lookup failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * Where Cortex's copy of a source has fallen behind the source itself.
 *
 * Question-independent on purpose. The gap list only catches questions Cortex
 * knows it failed; a reader returning the wrong slice fails silently, because
 * from the inside it looks like a quiet day. On 2026-09-23 three such failures
 * were found in one afternoon, all by the founder in Slack: the history read
 * the oldest page of each channel, attachments were dropped, and the live
 * feed had never delivered a channel message. Each would have shown up here.
 */
export async function loadBlindSpots(db: SupabaseClient): Promise<string[]> {
  const { data } = await db.from("war_room_source_state")
    .select("source_key, last_success_at, last_error, metadata")
    .in("source_key", ["slack_history", "slack_events", "archive"]);
  const rows = (data ?? []) as Array<{ source_key: string; last_success_at: string | null; last_error: string | null; metadata: Record<string, unknown> | null }>;
  const byKey = new Map(rows.map((row) => [row.source_key, row]));
  const spots: string[] = [];
  const DAY = 86_400_000;
  const days = (ms: number) => Math.round(ms / DAY);

  const history = byKey.get("slack_history");
  type Result = { channel: string; error?: string; newestInSlack?: string | null; newestStored?: string | null; threadError?: string; threadsRead?: number; replies?: number };
  const results = ((history?.metadata as { results?: Result[] } | null)?.results ?? []);
  for (const result of results) {
    if (result.error) {
      spots.push(`#${result.channel}: cannot read it (${result.error}); invite the Cortex app to the channel.`);
      continue;
    }
    if (result.newestInSlack) {
      const lag = new Date(result.newestInSlack).getTime() - (result.newestStored ? new Date(result.newestStored).getTime() : 0);
      if (lag > DAY) {
        spots.push(result.newestStored
          ? `#${result.channel}: my copy is ${days(lag)} days behind the channel.`
          : `#${result.channel}: I hold nothing from it, though it has messages.`);
      }
    }
  }
  const attachmentError = (history?.metadata as { attachment_error?: string } | null)?.attachment_error;
  if (attachmentError) {
    spots.push(`Shared documents are not being read (${attachmentError}), so I can see that a file was shared but not what it says.`);
  }
  const authorError = (history?.metadata as { author_lookup_error?: string } | null)?.author_lookup_error;
  if (authorError) {
    spots.push(`Slack author names are not being stored (${authorError})${authorError.includes("scope") ? "; the Slack app needs the users:read permission" : ""}, so I cannot find a message by who wrote it.`);
  }
  const threadFailures = results.filter((result) => result.threadError);
  if (threadFailures.length) {
    spots.push(`Slack thread replies failed in ${threadFailures.length} channel(s) (${threadFailures[0].threadError}); replies inside threads are invisible to me.`);
  }
  if (history?.last_success_at && Date.now() - new Date(history.last_success_at).getTime() > 2 * DAY) {
    spots.push(`Slack backfill has not succeeded for ${days(Date.now() - new Date(history.last_success_at).getTime())} days.`);
  }

  // The live feed stores a channel message the moment it is posted. If it has
  // never recorded one, or not for days, every message between scans exists
  // only if the daily backfill happens to reach it.
  const events = byKey.get("slack_events");
  if (!events?.last_success_at) {
    spots.push("The live Slack feed has never delivered a channel message. Between daily scans I only see what the backfill reaches; the Slack app likely is not subscribed to channel message events.");
  } else if (Date.now() - new Date(events.last_success_at).getTime() > 2 * DAY) {
    spots.push(`The live Slack feed has delivered nothing for ${days(Date.now() - new Date(events.last_success_at).getTime())} days.`);
  }
  const archive = byKey.get("archive");
  if (archive?.last_success_at && Date.now() - new Date(archive.last_success_at).getTime() > 2 * DAY) {
    spots.push(`The written record (SCRATCHPAD and docs) has not refreshed for ${days(Date.now() - new Date(archive.last_success_at).getTime())} days.`);
  }
  return spots;
}

/**
 * Search the stored record, ranked by how much of the question each item
 * matches.
 *
 * The first search matched any single word and kept the twelve newest hits.
 * Asked about "the message from Minh Huet about the feedback from the cares
 * study", the right item -- Minh-Nguyet's Sep 17 post in #care-nav-study-team,
 * matching "feedback", "study" and "care" -- ranked fourteenth behind recent
 * chatter that merely contained "message", and was cut. Cortex then told the
 * founder, confidently, that it was not there.
 *
 * Now: words are loosely stemmed ("cares" finds "care"), filler is dropped,
 * each candidate is scored by distinct words matched across its text, title,
 * channel and author, and the model can call this again with other phrasings,
 * a channel hint or an author hint. Names are matched on any part, since the
 * founder may type or dictate a short or misheard form.
 */
const SEARCH_FILLER = new Set([
  "the", "and", "about", "from", "that", "this", "with", "what", "when", "where", "which", "who", "why", "how",
  "you", "your", "know", "message", "messages", "said", "say", "tell", "did", "does", "any", "there", "their",
  "have", "has", "was", "were", "are", "for", "into", "some", "something", "thing", "things", "got", "get",
]);

function stem(word: string) {
  return word.length > 4 ? word.replace(/(ings|ing|ies|es|s)$/, "") : word;
}

export function searchWords(text: string): string[] {
  return [...new Set(text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/[\s-]+/)
    .filter((word) => word.length >= 3 && !SEARCH_FILLER.has(word))
    .map(stem)
    .filter((word) => word.length >= 3))].slice(0, 10);
}

export async function searchStoredRecord(
  db: SupabaseClient,
  options: { query: string; channel?: string; author?: string; days?: number; limit?: number },
) {
  const words = searchWords(options.query);
  const channelWords = options.channel ? searchWords(options.channel) : [];
  const authorWords = options.author ? searchWords(options.author) : [];
  const all = [...new Set([...words, ...channelWords, ...authorWords])];
  if (!all.length) return { matches: [], note: "Nothing to search for." };
  // One candidate list per word, not one list for all of them. A single
  // recency-ordered list lets common words fill every slot with recent
  // chatter, so an older item matching only the rarer, telling words -- the
  // case that hid Minh-Nguyet's feedback -- falls outside it again as the
  // record grows. Per word, a rare word always brings back its matches.
  const perWord = await Promise.all(all.map(async (word) => {
    let request = db.from("war_room_source_items")
      .select("id, source, source_group, title, content, source_url, occurred_at, metadata")
      .or(`title.ilike.*${word}*,content.ilike.*${word}*,source_group.ilike.*${word}*`)
      .order("occurred_at", { ascending: false, nullsFirst: false })
      .limit(150);
    if (options.days) request = request.gte("occurred_at", new Date(Date.now() - options.days * 86_400_000).toISOString());
    return request;
  }));
  const failed = perWord.find((result) => result.error);
  if (failed?.error) return { unavailable: `Could not search the record: ${failed.error.message}` };
  const byId = new Map<string, unknown>();
  for (const result of perWord) for (const row of (result.data ?? []) as Array<{ id: string }>) byId.set(row.id, row);
  const data = [...byId.values()];
  type Row = { source: string; source_group: string | null; title: string | null; content: string | null; source_url: string | null; occurred_at: string | null; metadata: { author_name?: string | null } | null };
  const scored = ((data ?? []) as Row[]).map((row) => {
    const author = (row.metadata?.author_name ?? "").toLowerCase();
    const group = (row.source_group ?? "").toLowerCase();
    const haystack = `${row.title ?? ""} ${row.content ?? ""} ${group} ${author}`.toLowerCase();
    let score = words.filter((word) => haystack.includes(word)).length;
    if (channelWords.length && channelWords.some((word) => group.includes(word))) score += 2;
    if (authorWords.length && authorWords.some((word) => author.includes(word))) score += 3;
    return { row, score, author: row.metadata?.author_name ?? null };
  }).filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || (b.row.occurred_at ?? "").localeCompare(a.row.occurred_at ?? ""));
  return {
    searchedFor: all,
    candidates: scored.length,
    matches: scored.slice(0, options.limit ?? 8).map(({ row, score, author }) => ({
      where: row.source === "slack" ? `#${row.source_group}` : row.source_group,
      author: author ?? (row.source === "slack" ? "not recorded" : null),
      when: row.occurred_at,
      wordsMatched: score,
      excerpt: (row.content ?? "").slice(0, 700),
      url: row.source_url,
    })),
  };
}

/**
 * The full text of a shared document, for summarising it. Documents are stored
 * as their own items (source_kind "attachment") when the Slack copy reads the
 * message they were shared with; search returns only excerpts.
 */
export async function readSharedDocument(db: SupabaseClient, query: string) {
  const words = searchWords(query);
  const { data, error } = await db.from("war_room_source_items")
    .select("title, content, source_group, occurred_at, source_url, metadata")
    .eq("source_kind", "attachment")
    .order("occurred_at", { ascending: false })
    .limit(200);
  if (error) return { unavailable: `Could not read documents: ${error.message}` };
  type Row = { title: string | null; content: string | null; source_group: string | null; occurred_at: string | null; source_url: string | null; metadata: { file_name?: string; author_name?: string | null } | null };
  const rows = (data ?? []) as Row[];
  if (!rows.length) return { found: false, note: "No shared document has been read yet. Documents are read when the daily scan copies the message they were shared with." };
  const ranked = rows.map((row) => {
    const hay = `${row.title ?? ""} ${row.source_group ?? ""} ${row.metadata?.author_name ?? ""}`.toLowerCase();
    return { row, score: words.filter((word) => hay.includes(word)).length };
  }).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score === 0) return { found: false, documentsAvailable: rows.slice(0, 10).map((row) => row.title) };
  return {
    found: true,
    file: best.row.metadata?.file_name ?? best.row.title,
    where: `#${best.row.source_group}`,
    sharedBy: best.row.metadata?.author_name ?? "not recorded",
    sharedAt: best.row.occurred_at,
    url: best.row.source_url,
    text: best.row.content,
  };
}

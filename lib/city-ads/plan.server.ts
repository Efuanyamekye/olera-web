import { getServiceClient } from "@/lib/admin";
import { offerStillHolds } from "@/lib/city-ads/offer-holds";
import {
  MAX_OFFERS_PER_LEAD,
  OFFER_WINDOW_MINUTES,
  getCityConfig,
  isStaffedNow,
  nextStaffedStart,
} from "./config";

/**
 * WHERE THIS LEAD IS GOING, AND WHEN.
 *
 * The relay decides one step at a time: it offers to a provider, waits thirty
 * minutes, and only picks the next one when that offer expires. Nothing was
 * ever written down in advance, so from the outside a lead sat at "Open, day 1"
 * and the team had no way to know it was about to go to three agencies, or
 * which three, or at what time. Bessie Brooks went to Assisting Hands,
 * Cambridge Caregivers and Granny NANNIES inside ninety minutes on a Saturday
 * and none of that was visible anywhere until afterwards.
 *
 * This derives the whole plan at read time from exactly the inputs the relay
 * uses — the same city_pool query, the same care-type match, the same
 * thirty-minute window, the same staffed-hours rule. It writes nothing and
 * changes no behaviour. It cannot disagree with what will happen, because it
 * reads what the decision will be made from.
 *
 * Projected times are projections and are labelled as such: an offer that is
 * accepted or declined early moves everything after it earlier.
 */

export type PlanStepState = "accepted" | "moved" | "declined" | "expired" | "sent" | "upcoming";

export interface PlanStep {
  position: number;
  providerId: string;
  providerName: string;
  /** ISO. Actual for a step that has happened, projected for one that has not. */
  at: string;
  projected: boolean;
  state: PlanStepState;
}

export type PlanState =
  | "accepted" // a provider took it; nothing further goes out
  | "live" // an offer is open right now, clock running
  | "scheduled" // qualified and waiting for the next send
  | "held" // something must happen before anything sends
  | "exhausted" // the pool ran out or the cap was hit
  | "closed"; // archived or otherwise finished

export interface RoutingPlan {
  state: PlanState;
  /** One sentence, plain words, safe to render as-is. */
  reason: string;
  /** When the next send goes out. Null when nothing is scheduled. */
  nextAt: string | null;
  steps: PlanStep[];
  /**
   * Who would get it next, in order, even while the lead is held.
   *
   * `steps` only projects sends when nothing blocks them, so a held lead showed
   * no providers at all, and the person about to release it with a call could
   * not see where "Save and route" was about to send it. Empty once a provider
   * has taken it or the lead is closed.
   */
  candidates: { providerId: string; providerName: string }[];
}

interface LeadRow {
  id: string;
  slug: string;
  status: string;
  care_type: string;
  qualification_reply_at: string | null;
  qualification_verdict: string | null;
  next_offer_at: string | null;
  archived_at: string | null;
  capture_method: string | null;
  accepted_offer_id: string | null;
}

const MIN = 60 * 1000;

/** Roll a projected send forward to the next staffed hour when it lands outside one. */
function whenStaffed(at: Date, tz: string): Date {
  return isStaffedNow(tz, at) ? at : nextStaffedStart(tz, at);
}

export async function getRoutingPlan(
  db: ReturnType<typeof getServiceClient>,
  leadId: string,
  now: Date = new Date(),
): Promise<RoutingPlan | null> {
  const { data: leadRow } = await db
    .from("city_leads")
    .select(
      "id, slug, status, care_type, qualification_reply_at, qualification_verdict, next_offer_at, archived_at, capture_method, accepted_offer_id",
    )
    .eq("id", leadId)
    .maybeSingle();
  const lead = leadRow as LeadRow | null;
  if (!lead) return null;

  const cfg = getCityConfig(lead.slug);
  const tz = cfg?.timeZone ?? "America/Chicago";

  const { data: offerRows } = await db
    .from("city_lead_offers")
    .select("id, provider_id, position, offered_at, expires_at, accepted_at, declined_at, expired_at, outcome")
    .eq("lead_id", lead.id)
    .order("position", { ascending: true });
  const offers = (offerRows ?? []) as {
    id: string;
    outcome: string | null;
    provider_id: string;
    position: number;
    offered_at: string;
    expires_at: string;
    accepted_at: string | null;
    declined_at: string | null;
    expired_at: string | null;
  }[];

  const { data: poolRows } = await db
    .from("city_pool")
    .select("provider_id, position, care_types")
    .eq("slug", lead.slug)
    .eq("enabled", true)
    .eq("is_test", false)
    .order("position", { ascending: true });
  const pool = (poolRows ?? []) as { provider_id: string; position: number; care_types: string[] }[];

  // One lookup for every provider named in the plan, past or future.
  const ids = Array.from(new Set([...offers.map((o) => o.provider_id), ...pool.map((p) => p.provider_id)]));
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: provRows } = await db.from("business_profiles").select("id, display_name").in("id", ids);
    for (const p of (provRows ?? []) as { id: string; display_name: string | null }[]) {
      names.set(p.id, p.display_name ?? "a provider");
    }
  }
  const nameOf = (id: string) => names.get(id) ?? "a provider";

  const steps: PlanStep[] = offers.map((o) => ({
    position: o.position,
    providerId: o.provider_id,
    providerName: nameOf(o.provider_id),
    at: o.offered_at,
    projected: false,
    // Taken and then released (the ladder, or Move) reads as moved on.
    state: o.accepted_at ? (offerStillHolds(o, lead) ? "accepted" : "moved") : o.declined_at ? "declined" : o.expired_at ? "expired" : "sent",
  }));

  const accepted = offers.find((o) => offerStillHolds(o, lead));
  if (accepted) {
    return {
      state: "accepted",
      reason: `${nameOf(accepted.provider_id)} took this request. Nothing further goes out.`,
      nextAt: null,
      steps,
      candidates: [],
    };
  }
  // Same rule as the relay (startOrAdvance): only new, offered and unfilled
  // leads can move. A lead marked "not a fit" used to read as held, with a
  // list of providers it was about to go to.
  if (lead.archived_at || !["new", "offered", "unfilled"].includes(lead.status)) {
    return { state: "closed", reason: "This lead is closed. Nothing further goes out.", nextAt: null, steps, candidates: [] };
  }

  // A live offer holds the queue: the next provider is not chosen until this
  // one expires, so the rest of the plan hangs off that expiry, not off now.
  const live = offers.find(
    (o) => !o.accepted_at && !o.declined_at && !o.expired_at && new Date(o.expires_at).getTime() > now.getTime(),
  );

  // WHAT WOULD BLOCK THE NEXT SEND. Same order as the relay's own gate.
  let held: string | null = null;
  if (!lead.qualification_reply_at) {
    // Either one releases it. "Save and route" records what a caller heard in
    // the same field the family's reply fills, so a call does release a held
    // lead. This line used to say it did not, on the page the calls are
    // logged from.
    held = "Held until we know what they need. Their reply to the qualifying text, or what you heard on a call, releases it.";
  } else if (lead.qualification_verdict === null) {
    held = "Their reply is waiting to be read. Nothing sends until it has been judged, which happens within five minutes.";
  } else if (lead.qualification_verdict !== "care_seeker") {
    held = `Their reply was judged "${lead.qualification_verdict}", so this never goes to a provider unless someone sends it by hand.`;
  } else if (lead.status === "unfilled") {
    held = "Every provider in the pool has already seen this and none took it.";
  }

  // Who is still eligible, in the order the relay will take them.
  const seen = new Set(offers.map((o) => o.provider_id));
  const wants = lead.care_type === "unsure" ? ["home_care", "assisted_living"] : [lead.care_type];
  const remaining: { provider_id: string }[] = [];
  const available = pool.filter((p) => !seen.has(p.provider_id));
  const taken = new Set<string>();
  for (let i = offers.length; i < MAX_OFFERS_PER_LEAD; i++) {
    let hit: (typeof available)[number] | undefined;
    for (const w of wants) {
      hit = available.find((e) => !taken.has(e.provider_id) && e.care_types.includes(w));
      if (hit) break;
    }
    if (!hit) break;
    taken.add(hit.provider_id);
    remaining.push({ provider_id: hit.provider_id });
  }

  // Project the upcoming sends. The first hangs off a live offer's expiry, a
  // parked morning, or now; each one after it is a window later, and any that
  // lands outside staffed hours rolls to the next staffed start.
  let cursor = live
    ? new Date(new Date(live.expires_at).getTime())
    : lead.next_offer_at
      ? new Date(lead.next_offer_at)
      : new Date(now.getTime());
  if (!held) {
    for (let i = 0; i < remaining.length; i++) {
      cursor = whenStaffed(i === 0 ? cursor : new Date(cursor.getTime() + OFFER_WINDOW_MINUTES * MIN), tz);
      steps.push({
        position: offers.length + i + 1,
        providerId: remaining[i].provider_id,
        providerName: nameOf(remaining[i].provider_id),
        at: cursor.toISOString(),
        projected: true,
        state: "upcoming",
      });
    }
  }

  const firstUpcoming = steps.find((s) => s.state === "upcoming");
  const candidates = remaining.map((r) => ({ providerId: r.provider_id, providerName: nameOf(r.provider_id) }));

  if (held) return { state: "held", reason: held, nextAt: null, steps, candidates };
  if (live) {
    return {
      state: "live",
      reason: `${nameOf(live.provider_id)} has it now and has until ${fmt(live.expires_at, tz)} to take it.`,
      nextAt: firstUpcoming?.at ?? null,
      steps,
      candidates,
    };
  }
  if (!firstUpcoming) {
    return {
      state: "exhausted",
      reason:
        offers.length >= MAX_OFFERS_PER_LEAD
          ? `This has been to ${MAX_OFFERS_PER_LEAD} providers, which is the limit. Nothing further goes out on its own.`
          : "No provider left in this city's pool matches what they asked for.",
      nextAt: null,
      steps,
      candidates,
    };
  }
  return {
    state: "scheduled",
    reason: `Goes to ${firstUpcoming.providerName} at ${fmt(firstUpcoming.at, tz)}.`,
    nextAt: firstUpcoming.at,
    steps,
    candidates,
  };
}

/** Local to the city, because that is the clock the relay runs on. */
function fmt(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}

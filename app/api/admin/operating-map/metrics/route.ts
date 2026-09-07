import { NextRequest, NextResponse } from "next/server";
import { getAdminUser, getAuthUser, getServiceClient } from "@/lib/admin";
import { CHANNELS, CHANNEL_LABELS } from "@/lib/analytics/channel";
import {
  CHANNEL_SIGNALS_START,
  getTrafficByChannel,
  REFERRER_INSTRUMENTATION_START,
  VISITOR_GEO_START,
} from "@/lib/operating-map/traffic.server";
import { getPageVisits } from "@/lib/operating-map/page-visits.server";
import { getConversions } from "@/lib/operating-map/conversions.server";
import { runChecks } from "@/lib/operating-map/checks";
import {
  getProvidersInOutreach,
  getProvidersListed,
} from "@/lib/operating-map/providers.server";
import { getMilestones } from "@/lib/operating-map/milestones.server";
import { getCampusSupply } from "@/lib/operating-map/campuses.server";
import { getTracks } from "@/lib/operating-map/tracks.server";

/**
 * GET /api/admin/operating-map/metrics?date_from&date_to
 *
 * The operating map's flow metrics — the nodes that count something over a
 * period, as opposed to the city list, which is a standing set.
 *
 * The response is shaped as a map of node id to value
 * so later nodes are added here rather than each growing its own endpoint and
 * its own round trip.
 *
 * Every node reports its own caveats. A number on this map is read as the
 * truth about a step of the funnel, so a node that is a floor, or that
 * ignores the city filter, has to say so in the payload instead of relying on
 * whoever reads the chart to remember.
 */

/** Authorized response — never handed to Next's shared cache. See cities/. */
export const dynamic = "force-dynamic";

/**
 * Completing a profile is not recorded with a timestamp, so M1 and M2 count
 * profiles created in the window that are complete now. Stated on the node
 * rather than left for someone to discover.
 */
/**
 * Only a row's creation is timestamped, not the status it later reached, so
 * these count rows created in the window that have since got there.
 */
const STATUS_TIMING_CAVEAT =
  "Counts rows created in this range that have since reached this state — the status change itself is not timestamped.";

const PROFILE_TIMING_CAVEAT =
  "Counts profiles created in this range that are in this state now — reaching it is not itself timestamped.";

/** A named part of a node's total, rendered on the card under its label. */
export interface OperatingMapBreakdown {
  label: string;
  /** Null renders as a dash — a part with no source yet, not a zero. */
  value: number | null;
}

export interface OperatingMapNode {
  value: number | null;
  /** Parts that sum to `value`. Omitted when a node has no split. */
  breakdown?: OperatingMapBreakdown[];
  /**
   * A caveat that applies to this value right now — a range reaching back
   * past the instrumentation, a hit row ceiling. Shown only inside the
   * node's tooltip, never as text on the card.
   */
  caveat?: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const adminUser = await getAdminUser(user.id);
    if (!adminUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("date_from");
    const to = searchParams.get("date_to");
    const city = searchParams.get("city");

    const db = getServiceClient();
    const nodes: Record<string, OperatingMapNode> = {};
    let trafficChannelSum: number | undefined;
    let visitsPartsSum: number | undefined;
    let cp1OrphanedClaims: number | undefined;
    let cp1Unclaimed: number | undefined;
    let inquiriesRaised: number | undefined;
    let interviewsProposed: number | undefined;

    // A city filter over a range that starts before visitor geo was recorded
    // returns a structural zero, not a quiet market. Every city-scoped node
    // has to say so.
    const cityPredatesGeo =
      Boolean(city) && (!from || from < VISITOR_GEO_START);

    // Some nodes cannot be placed in a city at all — an interview or a
    // placement records neither a provider's city nor a visitor's. Those say
    // so rather than looking like a quiet market.
    const notCityScoped = city
      ? "Not scoped by city — an interview or a placement records neither party's city."
      : null;

    /** Both caveats where a node carries both. */
    const withCity = (note: string) =>
      notCityScoped ? `${note} ${notCityScoped}` : note;

    try {
      const traffic = await getTrafficByChannel(db, { from, to }, city);

      const caveats: string[] = [];
      // Without this a city filter over an older range reads as no demand
      // when it is really no data.
      if (traffic.partialCityData) {
        caveats.push(`City is only recorded from ${VISITOR_GEO_START}.`);
      }
      // Without this the chart reads as a traffic collapse before August.
      if (traffic.partialInstrumentation) {
        caveats.push(`Traffic source is only identified from ${REFERRER_INSTRUMENTATION_START}.`);
      }
      // The split, not the total, is what an older range gets wrong: paid and
      // email have no signal to match on and fall into search or unattributed.
      if (traffic.partialChannelSignals) {
        caveats.push(
          `Paid, email and SMS are only separable from ${CHANNEL_SIGNALS_START} — before that they sit inside organic search and unattributed.`,
        );
      }
      if (traffic.truncated) caveats.push("Row ceiling reached — this is a floor.");

      trafficChannelSum = CHANNELS.reduce((sum, c) => sum + traffic.byChannel[c], 0);
      nodes.traffic = {
        value: traffic.total,
        // Every channel, including the empty ones. A channel reading zero
        // because nothing is instrumented looks identical to one reading
        // zero because nobody came, and only the row makes that sayable.
        breakdown: CHANNELS.map((c) => ({
          label: CHANNEL_LABELS[c],
          value: traffic.byChannel[c],
        })),
        caveat: caveats.length ? caveats.join(" ") : null,
      };
    } catch (error) {
      console.error("[operating-map/metrics] traffic failed:", error);
      // One failed node must not blank the others. Null is rendered as
      // unavailable, never as zero.
      nodes.traffic = { value: null, caveat: "This metric failed to load." };
    }

    try {
      const visits = await getPageVisits(db, { from, to }, city);
      visitsPartsSum = visits.provider + visits.editorial + visits.benefit;
      nodes.visits = {
        value: visits.total,
        // Order matches the labels printed on the card.
        breakdown: [
          { label: "provider", value: visits.provider },
          { label: "editorial", value: visits.editorial },
          { label: "benefits", value: visits.benefit },
        ],
        caveat: cityPredatesGeo
          ? `City is only recorded from ${VISITOR_GEO_START}.`
          : null,
      };
    } catch (error) {
      console.error("[operating-map/metrics] visits failed:", error);
      nodes.visits = { value: null, caveat: "This metric failed to load." };
    }

    try {
      const c = await getConversions(db, { from, to }, city);
      nodes.cr1 = {
        // Counts actions, not distinct families: a question can be asked
        // without an account, so there is no family identity behind it to
        // de-duplicate on. The tooltip says so.
        value: c.ctasTotal,
        breakdown: [
          { label: "questions", value: c.questions },
          { label: "connections", value: c.connections },
          { label: "benefits assessments", value: c.benefitsAssessments },
        ],
        caveat: null,
      };
      nodes.cr2 = { value: c.familiesInOutreach, caveat: null };
      // Kept for the drill-downs and the consistency check, not drawn.
      nodes.cr6a = { value: c.questions, caveat: null };
      nodes.cr6b = { value: c.connections, caveat: null };
      nodes.cr6c = { value: c.benefitsAssessments, caveat: null };
    } catch (error) {
      console.error("[operating-map/metrics] cr6 failed:", error);
      const failed = { value: null, caveat: "This metric failed to load." };
      nodes.cr1 = failed;
      nodes.cr2 = failed;
      nodes.cr6a = failed;
      nodes.cr6b = failed;
      nodes.cr6c = failed;
    }

    try {
      // CP1 is a standing count of the directory; CP2 is a flow, because
      // being contacted happens on a date. The city on both is the
      // provider's, not the visitor's — see the module note.
      const [listed, inOutreach] = await Promise.all([
        getProvidersListed(db, city),
        getProvidersInOutreach(db, { from, to }, city),
      ]);
      cp1Unclaimed = listed.unclaimed;
      cp1OrphanedClaims = listed.orphanedClaims;
      nodes.cp1 = {
        value: listed.total,
        breakdown: [
          { label: "claimed", value: listed.claimed },
          { label: "unclaimed", value: listed.unclaimed },
        ],
        caveat: null,
      };
      nodes.cp2 = {
        value: inOutreach.value,
        caveat: inOutreach.truncated ? "Row ceiling reached — this is a floor." : null,
      };
    } catch (error) {
      console.error("[operating-map/metrics] cp1/cp2 failed:", error);
      nodes.cp1 = { value: null, caveat: "This metric failed to load." };
      nodes.cp2 = { value: null, caveat: "This metric failed to load." };
    }

    try {
      const m = await getMilestones(db, { from, to }, city);
      nodes.m1 = {
        value: m.careRecipientProfilesStarted,
        breakdown: [
          { label: "started", value: m.careRecipientProfilesStarted },
          { label: "completed", value: m.careRecipientProfiles },
          { label: "live", value: m.careRecipientProfilesLive },
        ],
        caveat: PROFILE_TIMING_CAVEAT,
      };
      nodes.m2 = {
        value: m.providersClaimed,
        // Completed and verified are counted among this range's claimers, so
        // the three read as one funnel rather than three unrelated totals.
        breakdown: [
          { label: "claimed", value: m.providersClaimed },
          { label: "verified", value: m.providersVerified },
        ],
        caveat: null,
      };
      nodes.m3 = {
        value: m.managedAdSignups,
        breakdown: [
          { label: "signups", value: m.managedAdSignups },
          { label: "repeat", value: m.managedAdRepeat },
        ],
        caveat:
          "Repeat customers are counted over all time — a repeat happens across two moments, so a short range would report almost none.",
      };
      nodes.m4 = { value: m.staffingSignups, caveat: null };
      nodes.m5 = {
        value: m.careWorkerProfilesStarted,
        breakdown: [
          // Activating a university channel is not recorded anywhere yet, so
          // it shows as a dash rather than a zero.
          { label: "channels activated", value: null },
          { label: "started", value: m.careWorkerProfilesStarted },
          { label: "complete", value: m.careWorkerProfiles },
        ],
        caveat: PROFILE_TIMING_CAVEAT,
      };
    } catch (error) {
      console.error("[operating-map/metrics] m1-m5 failed:", error);
      const failed = { value: null, caveat: "This metric failed to load." };
      nodes.m1 = failed;
      nodes.m2 = failed;
      nodes.m3 = failed;
      nodes.m4 = failed;
      nodes.m5 = failed;
    }

    try {
      // Standing counts, like CP1 — a university is listed or it is not.
      const supply = await getCampusSupply(db, city);
      nodes.cw1 = {
        value: supply.universities,
        breakdown: [
          { label: "universities", value: supply.universities },
          { label: "advisors", value: supply.advisors },
        ],
        caveat: null,
      };
      nodes.cw2 = { value: supply.advisorsInOutreach, caveat: null };
    } catch (error) {
      console.error("[operating-map/metrics] cw1/cw2 failed:", error);
      nodes.cw1 = { value: null, caveat: "This metric failed to load." };
      nodes.cw2 = { value: null, caveat: "This metric failed to load." };
    }

    try {
      const t = await getTracks(db, { from, to });
      inquiriesRaised = t.inquiriesRaised;
      interviewsProposed = t.interviewsProposed;
      nodes.ta1 = {
        value: t.benefitsApplied,
        caveat: withCity(
          "Self-reported by the family in the benefits check-in, so this is a floor — anyone who applied without answering is missing.",
        ),
      };
      nodes.tb1 = { value: t.inquiriesResponded, caveat: notCityScoped };
      nodes.tc1 = {
        value: t.interviewsScheduled,
        breakdown: [
          { label: "scheduled", value: t.interviewsScheduled },
          { label: "completed", value: t.interviewsCompleted },
        ],
        caveat: withCity(STATUS_TIMING_CAVEAT),
      };
      nodes.tc2 = { value: t.hires, caveat: withCity(STATUS_TIMING_CAVEAT) };
      // TA2 and TB2 have no source. Whether aid was granted, and whether
      // care actually started, both happen off the platform.
    } catch (error) {
      console.error("[operating-map/metrics] tracks failed:", error);
      const failed = { value: null, caveat: "This metric failed to load." };
      nodes.ta1 = failed;
      nodes.tb1 = failed;
      nodes.tc1 = failed;
      nodes.tc2 = failed;
    }

    // Relationships that must hold if the map is counting correctly. Sent
    // with the numbers so a broken one is visible where the numbers are.
    const values = Object.fromEntries(
      Object.entries(nodes).map(([id, node]) => [id, node.value]),
    );
    const checks = runChecks(values, {
      trafficChannelSum,
      visitsPartsSum,
      cp1OrphanedClaims,
      cp1Unclaimed,
      inquiriesRaised,
      interviewsProposed,
    });

    return NextResponse.json({ nodes, checks });
  } catch (error) {
    console.error("[operating-map/metrics] Failed:", error);
    return NextResponse.json({ error: "Failed to load metrics" }, { status: 500 });
  }
}

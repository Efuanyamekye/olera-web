import { NextRequest, NextResponse } from "next/server";
import { getAdminUser, getAuthUser, getServiceClient } from "@/lib/admin";
import {
  getOrganicVisitors,
  REFERRER_INSTRUMENTATION_START,
  VISITOR_GEO_START,
} from "@/lib/operating-map/organic.server";
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
  "Counts profiles created in this range that are complete now — completion itself is not timestamped.";

/** A named part of a node's total, rendered on the card under its label. */
export interface OperatingMapBreakdown {
  label: string;
  value: number;
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
    let cr4PartsSum: number | undefined;
    let cp1OrphanedClaims: number | undefined;
    let cp1Unclaimed: number | undefined;
    let inquiriesRaised: number | undefined;
    let interviewsProposed: number | undefined;

    // A city filter over a range that starts before visitor geo was recorded
    // returns a structural zero, not a quiet market. Every city-scoped node
    // has to say so.
    const cityPredatesGeo =
      Boolean(city) && (!from || from < VISITOR_GEO_START);

    // Visitor geo rides on page views. Form submissions are written through
    // their own routes and carry none, so those nodes ignore the city filter
    // and must say so rather than look like a quiet market.
    const notCityScoped = city
      ? "Not scoped by city — city is only recorded on page views."
      : null;

    try {
      const organic = await getOrganicVisitors(db, { from, to }, city);
      const caveats: string[] = [];
      if (organic.partialCityData) {
        // Without this a city filter over an older range reads as no demand
        // when it is really no data.
        caveats.push(`City is only recorded from ${VISITOR_GEO_START}.`);
      }
      if (organic.partialInstrumentation) {
        // Without this the chart reads as a traffic collapse before August.
        caveats.push(`Search traffic is only identified from ${REFERRER_INSTRUMENTATION_START}.`);
      }
      if (organic.truncated) caveats.push("Row ceiling reached — this is a floor.");

      nodes.cr2 = {
        value: organic.value,
        caveat: caveats.length ? caveats.join(" ") : null,
      };
    } catch (error) {
      console.error("[operating-map/metrics] cr2 failed:", error);
      // One failed node must not blank the others. Null is rendered as
      // unavailable, never as zero.
      nodes.cr2 = { value: null, caveat: "This metric failed to load." };
    }

    try {
      const visits = await getPageVisits(db, { from, to }, city);
      cr4PartsSum = visits.provider + visits.editorial + visits.benefit;
      nodes.cr4 = {
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
      console.error("[operating-map/metrics] cr4 failed:", error);
      nodes.cr4 = { value: null, caveat: "This metric failed to load." };
    }

    try {
      const c = await getConversions(db, { from, to });
      // No breakdown here: CR6a/b/c render as their own chips directly
      // below, so a split on the parent would print the same three numbers
      // twice.
      nodes.cr6 = { value: c.ctasTotal, caveat: notCityScoped };
      nodes.cr6a = { value: c.questions, caveat: notCityScoped };
      nodes.cr6b = { value: c.connections, caveat: notCityScoped };
      nodes.cr6c = { value: c.benefitsAssessments, caveat: notCityScoped };
    } catch (error) {
      console.error("[operating-map/metrics] cr6 failed:", error);
      const failed = { value: null, caveat: "This metric failed to load." };
      nodes.cr6 = failed;
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
        value: m.careRecipientProfiles,
        // Only the live half goes in the breakdown; the completed half is
        // already the node's value, and printing it twice is noise.
        breakdown: [{ label: "live", value: m.careRecipientProfilesLive }],
        caveat: PROFILE_TIMING_CAVEAT,
      };
      nodes.m2 = { value: m.careWorkerProfiles, caveat: PROFILE_TIMING_CAVEAT };
      nodes.m3 = { value: m.providersClaimed, caveat: null };
      nodes.m4 = { value: m.managedAdSignups, caveat: null };
      nodes.m5 = { value: m.staffingSignups, caveat: null };
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
      nodes.cw1 = { value: supply.universities, caveat: null };
      nodes.cw2 = { value: supply.advisors, caveat: null };
      // CW3 has no source yet: activating a channel is not recorded
      // anywhere, so it stays a dash rather than a guess.
    } catch (error) {
      console.error("[operating-map/metrics] cw1/cw2 failed:", error);
      nodes.cw1 = { value: null, caveat: "This metric failed to load." };
      nodes.cw2 = { value: null, caveat: "This metric failed to load." };
    }

    try {
      const t = await getTracks(db, { from, to });
      inquiriesRaised = t.inquiriesRaised;
      interviewsProposed = t.interviewsProposed;
      nodes.tb1 = { value: t.inquiriesResponded, caveat: STATUS_TIMING_CAVEAT };
      nodes.tc1 = { value: t.interviewsConfirmed, caveat: STATUS_TIMING_CAVEAT };
      nodes.tc2 = { value: t.hires, caveat: STATUS_TIMING_CAVEAT };
      // TA1-TA3, TB2, TB3 and TC3 have no source. Aid, care and hours all
      // continue off the platform, so they stay dashes rather than guesses.
    } catch (error) {
      console.error("[operating-map/metrics] tracks failed:", error);
      const failed = { value: null, caveat: "This metric failed to load." };
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
      cr4PartsSum,
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
